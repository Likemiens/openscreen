#pragma once

#include <Windows.h>
#include <d3d11.h>
#include <wrl/client.h>

// Crops and scales captured BGRA frames on the GPU (the D3D11 video processor), so a
// recording can be written at its final size: an area of the screen at the chosen quality,
// with nothing left to re-encode after Stop.
class GpuFrameScaler {
public:
    // `sourceRect` is the part of each input frame to keep; it is stretched to the output size.
    bool initialize(
        ID3D11Device* device,
        ID3D11DeviceContext* context,
        UINT inputWidth,
        UINT inputHeight,
        const RECT& sourceRect,
        UINT outputWidth,
        UINT outputHeight);

    // `input` must be inputWidth x inputHeight BGRA, created with D3D11_BIND_RENDER_TARGET.
    // Uses the immediate context: callers serialize it like every other use of the context.
    bool process(ID3D11Texture2D* input);

    ID3D11Texture2D* output() const { return output_.Get(); }

private:
    Microsoft::WRL::ComPtr<ID3D11Device> device_;
    Microsoft::WRL::ComPtr<ID3D11VideoDevice> videoDevice_;
    Microsoft::WRL::ComPtr<ID3D11VideoContext> videoContext_;
    Microsoft::WRL::ComPtr<ID3D11VideoProcessorEnumerator> enumerator_;
    Microsoft::WRL::ComPtr<ID3D11VideoProcessor> processor_;
    Microsoft::WRL::ComPtr<ID3D11Texture2D> output_;
    Microsoft::WRL::ComPtr<ID3D11VideoProcessorOutputView> outputView_;
    // The input view is made for the texture it was last given (normally always the same one).
    ID3D11Texture2D* lastInput_ = nullptr;
    Microsoft::WRL::ComPtr<ID3D11VideoProcessorInputView> inputView_;
};
