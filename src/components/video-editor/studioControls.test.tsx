import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	StudioNumberField,
	StudioSection,
	StudioSegmented,
	StudioSelect,
	StudioSliderRow,
	StudioToggleRow,
} from "./studioControls";

class StubResizeObserver {
	observe() {
		return undefined;
	}
	unobserve() {
		return undefined;
	}
	disconnect() {
		return undefined;
	}
}

beforeEach(() => {
	vi.stubGlobal("ResizeObserver", StubResizeObserver);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("StudioSection", () => {
	it("labels its content and shows an optional action", () => {
		render(
			<StudioSection label="Crop" action={<button type="button">Reset</button>}>
				<p>fields</p>
			</StudioSection>,
		);
		expect(screen.getByRole("heading", { name: "Crop" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
		expect(screen.getByText("fields")).toBeInTheDocument();
	});
});

describe("StudioSegmented", () => {
	const options = [
		{ value: "a", label: "Alpha" },
		{ value: "b", label: "Beta" },
	] as const;

	it("marks the current option and reports a new pick", () => {
		const onChange = vi.fn();
		render(<StudioSegmented label="Letters" options={options} value="a" onChange={onChange} />);
		expect(screen.getByRole("radiogroup", { name: "Letters" })).toBeInTheDocument();
		expect(screen.getByRole("radio", { name: "Alpha" })).toHaveAttribute("aria-checked", "true");
		fireEvent.click(screen.getByRole("radio", { name: "Beta" }));
		expect(onChange).toHaveBeenCalledWith("b");
	});

	it("selects nothing when the value is not one of the options", () => {
		render(
			<StudioSegmented
				label="Letters"
				options={options}
				value={"z" as "a" | "b"}
				onChange={vi.fn()}
			/>,
		);
		for (const radio of screen.getAllByRole("radio")) {
			expect(radio).toHaveAttribute("aria-checked", "false");
		}
	});
});

describe("StudioSelect", () => {
	it("reports the chosen option", () => {
		const onChange = vi.fn();
		render(
			<StudioSelect
				label="Device"
				value="none"
				onChange={onChange}
				options={[
					{ value: "none", label: "No device" },
					{ value: "phone", label: "Phone" },
				]}
			/>,
		);
		fireEvent.change(screen.getByLabelText("Device"), { target: { value: "phone" } });
		expect(onChange).toHaveBeenCalledWith("phone");
	});

	it("gives focus back after a pointer pick, so editor shortcuts are not typed into it", () => {
		render(
			<StudioSelect
				label="Device"
				value="none"
				onChange={vi.fn()}
				options={[
					{ value: "none", label: "No device" },
					{ value: "tablet", label: "Tablet" },
				]}
			/>,
		);
		const select = screen.getByLabelText("Device");
		select.focus();
		expect(select).toHaveFocus();
		fireEvent.change(select, { target: { value: "tablet" } });
		expect(select).not.toHaveFocus();
	});
});

describe("StudioSliderRow", () => {
	it("shows its label and formatted value, and steps with the keyboard", () => {
		const onChange = vi.fn();
		const onCommit = vi.fn();
		render(
			<StudioSliderRow
				label="Scale"
				value={80}
				display="80%"
				min={60}
				max={100}
				onChange={onChange}
				onCommit={onCommit}
			/>,
		);
		expect(screen.getByText("Scale")).toBeInTheDocument();
		expect(screen.getByText("80%")).toBeInTheDocument();
		const thumb = screen.getByRole("slider");
		thumb.focus();
		fireEvent.keyDown(thumb, { key: "ArrowRight" });
		expect(onChange).toHaveBeenCalledWith(81);
		expect(onCommit).toHaveBeenCalled();
	});
});

describe("StudioToggleRow", () => {
	it("is a switch that flips its value", () => {
		const onChange = vi.fn();
		render(<StudioToggleRow label="Blur background" checked={false} onChange={onChange} />);
		const toggle = screen.getByRole("switch", { name: "Blur background" });
		expect(toggle).toHaveAttribute("aria-checked", "false");
		fireEvent.click(toggle);
		expect(onChange).toHaveBeenCalledWith(true);
	});
});

describe("StudioNumberField", () => {
	function renderField(props: Partial<Parameters<typeof StudioNumberField>[0]> = {}) {
		const onCommit = vi.fn();
		const view = render(<StudioNumberField label="Top" value={0} onCommit={onCommit} {...props} />);
		const input = screen.getByLabelText("Top") as HTMLInputElement;
		return { onCommit, input, ...view };
	}

	it("commits once on Enter rather than on every keystroke", () => {
		const { input, onCommit } = renderField();
		input.focus();
		fireEvent.change(input, { target: { value: "1" } });
		fireEvent.change(input, { target: { value: "12" } });
		fireEvent.change(input, { target: { value: "125" } });
		expect(onCommit).not.toHaveBeenCalled();
		fireEvent.keyDown(input, { key: "Enter" });
		expect(onCommit).toHaveBeenCalledTimes(1);
		expect(onCommit).toHaveBeenCalledWith(125);
	});

	it("commits when focus leaves the field", () => {
		const { input, onCommit } = renderField();
		fireEvent.change(input, { target: { value: "5" } });
		fireEvent.blur(input);
		expect(onCommit).toHaveBeenCalledWith(5);
	});

	it("keeps digits only and clamps to the maximum", () => {
		const { input, onCommit } = renderField({ max: 480 });
		fireEvent.change(input, { target: { value: "-9x9e9" } });
		expect(input.value).toBe("999");
		fireEvent.blur(input);
		expect(onCommit).toHaveBeenCalledWith(480);
		expect(input.value).toBe("480");
	});

	it("does not commit an unchanged or emptied value", () => {
		const { input, onCommit } = renderField({ value: 7 });
		fireEvent.blur(input);
		fireEvent.change(input, { target: { value: "" } });
		fireEvent.blur(input);
		expect(onCommit).not.toHaveBeenCalled();
		expect(input.value).toBe("7");
	});

	it("restores the value on Escape", () => {
		const { input, onCommit } = renderField({ value: 7 });
		input.focus();
		fireEvent.change(input, { target: { value: "70" } });
		fireEvent.keyDown(input, { key: "Escape" });
		expect(input.value).toBe("7");
		expect(onCommit).not.toHaveBeenCalled();
	});

	it("steps with the arrow keys, by ten with Shift, never below zero", () => {
		const { input, onCommit } = renderField({ value: 5, max: 100 });
		fireEvent.keyDown(input, { key: "ArrowUp" });
		expect(onCommit).toHaveBeenLastCalledWith(6);
		fireEvent.keyDown(input, { key: "ArrowDown", shiftKey: true });
		expect(onCommit).toHaveBeenLastCalledWith(0);
	});

	it("follows the value it is given", () => {
		const { input, rerender } = renderField({ value: 5 });
		rerender(<StudioNumberField label="Top" value={40} onCommit={vi.fn()} />);
		expect(input.value).toBe("40");
	});
});
