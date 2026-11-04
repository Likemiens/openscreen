#include "gpu_frame_scaler.h"

#include <iostream>

namespace {

bool succeeded(HRESULT hr, const char* label) {
    if (SUCCEEDED(hr)) {
        return true;
    }
    std::cerr << "WARNING: GPU frame scaler: " << label << " failed (hr=0x" << std::hex << hr
              << std::dec << ")" << std::endl;
    return false;
}

} // namespace

bool GpuFrameScaler::initialize(
    ID3D11Device* device,
    ID3D11DeviceContext* context,
    UINT inputWidth,
    UINT inputHeight,
    const RECT& sourceRect,
    UINT outputWidth,
    UINT outputHeight) {
    if (!device || !context || inputWidth == 0 || inputHeight == 0 || outputWidth == 0 ||
        outputHeight == 0) {
        return false;
    }
    device_ = device;
    if (!succeeded(device->QueryInterface(IID_PPV_ARGS(&videoDevice_)), "ID3D11VideoDevice") ||
        !succeeded(context->QueryInterface(IID_PPV_ARGS(&videoContext_)), "ID3D11VideoContext")) {
        return false;
    }

    D3D11_VIDEO_PROCESSOR_CONTENT_DESC contentDesc{};
    contentDesc.InputFrameFormat = D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE;
    contentDesc.InputWidth = inputWidth;
    contentDesc.InputHeight = inputHeight;
    contentDesc.OutputWidth = outputWidth;
    contentDesc.OutputHeight = outputHeight;
    contentDesc.Usage = D3D11_VIDEO_USAGE_OPTIMAL_QUALITY;
    if (!succeeded(videoDevice_->CreateVideoProcessorEnumerator(&contentDesc, &enumerator_),
                   "CreateVideoProcessorEnumerator")) {
        return false;
    }

    UINT formatSupport = 0;
    if (!succeeded(enumerator_->CheckVideoProcessorFormat(DXGI_FORMAT_B8G8R8A8_UNORM, &formatSupport),
                   "CheckVideoProcessorFormat")) {
        return false;
    }
    const UINT needed = D3D11_VIDEO_PROCESSOR_FORMAT_SUPPORT_INPUT | D3D11_VIDEO_PROCESSOR_FORMAT_SUPPORT_OUTPUT;
    if ((formatSupport & needed) != needed) {
        std::cerr << "WARNING: GPU frame scaler: BGRA is not supported by the video processor" << std::endl;
        return false;
    }

    if (!succeeded(videoDevice_->CreateVideoProcessor(enumerator_.Get(), 0, &processor_),
                   "CreateVideoProcessor")) {
        return false;
    }

    D3D11_TEXTURE2D_DESC outputDesc{};
    outputDesc.Width = outputWidth;
    outputDesc.Height = outputHeight;
    outputDesc.MipLevels = 1;
    outputDesc.ArraySize = 1;
    outputDesc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    outputDesc.SampleDesc.Count = 1;
    outputDesc.Usage = D3D11_USAGE_DEFAULT;
    outputDesc.BindFlags = D3D11_BIND_RENDER_TARGET;
    if (!succeeded(device->CreateTexture2D(&outputDesc, nullptr, &output_), "CreateTexture2D(output)")) {
        return false;
    }

    D3D11_VIDEO_PROCESSOR_OUTPUT_VIEW_DESC outputViewDesc{};
    outputViewDesc.ViewDimension = D3D11_VPOV_DIMENSION_TEXTURE2D;
    if (!succeeded(videoDevice_->CreateVideoProcessorOutputView(
                       output_.Get(), enumerator_.Get(), &outputViewDesc, &outputView_),
                   "CreateVideoProcessorOutputView")) {
        return false;
    }

    // Screen pixels are full-range RGB on both sides; no video "enhancements" either.
    D3D11_VIDEO_PROCESSOR_COLOR_SPACE colorSpace{};
    colorSpace.RGB_Range = 0;
    const RECT destRect{0, 0, static_cast<LONG>(outputWidth), static_cast<LONG>(outputHeight)};
    videoContext_->VideoProcessorSetStreamFrameFormat(processor_.Get(), 0, D3D11_VIDEO_FRAME_FORMAT_PROGRESSIVE);
    videoContext_->VideoProcessorSetStreamColorSpace(processor_.Get(), 0, &colorSpace);
    videoContext_->VideoProcessorSetOutputColorSpace(processor_.Get(), &colorSpace);
    videoContext_->VideoProcessorSetStreamAutoProcessingMode(processor_.Get(), 0, FALSE);
    videoContext_->VideoProcessorSetStreamSourceRect(processor_.Get(), 0, TRUE, &sourceRect);
    videoContext_->VideoProcessorSetStreamDestRect(processor_.Get(), 0, TRUE, &destRect);
    videoContext_->VideoProcessorSetOutputTargetRect(processor_.Get(), TRUE, &destRect);
    return true;
}

bool GpuFrameScaler::process(ID3D11Texture2D* input) {
    if (!processor_ || !input) {
        return false;
    }
    if (input != lastInput_ || !inputView_) {
        inputView_.Reset();
        D3D11_VIDEO_PROCESSOR_INPUT_VIEW_DESC inputViewDesc{};
        inputViewDesc.ViewDimension = D3D11_VPIV_DIMENSION_TEXTURE2D;
        if (!succeeded(videoDevice_->CreateVideoProcessorInputView(
                           input, enumerator_.Get(), &inputViewDesc, &inputView_),
                       "CreateVideoProcessorInputView")) {
            lastInput_ = nullptr;
            return false;
        }
        lastInput_ = input;
    }

    D3D11_VIDEO_PROCESSOR_STREAM stream{};
    stream.Enable = TRUE;
    stream.pInputSurface = inputView_.Get();
    return succeeded(
        videoContext_->VideoProcessorBlt(processor_.Get(), outputView_.Get(), 0, 1, &stream),
        "VideoProcessorBlt");
}
