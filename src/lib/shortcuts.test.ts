import { describe, expect, it } from "vitest";
import { isTextEditingTarget } from "./shortcuts";

describe("isTextEditingTarget", () => {
	it("holds shortcuts back wherever typed characters belong to the control", () => {
		const editable = document.createElement("div");
		Object.defineProperty(editable, "isContentEditable", { value: true });

		expect(isTextEditingTarget(document.createElement("input"))).toBe(true);
		expect(isTextEditingTarget(document.createElement("textarea"))).toBe(true);
		expect(isTextEditingTarget(editable)).toBe(true);
		// A focused select treats a letter as type-ahead: T would add a trim and pick Tablet.
		expect(isTextEditingTarget(document.createElement("select"))).toBe(true);
	});

	it("lets shortcuts through everywhere else", () => {
		expect(isTextEditingTarget(document.createElement("button"))).toBe(false);
		expect(isTextEditingTarget(document.body)).toBe(false);
		expect(isTextEditingTarget(null)).toBe(false);
	});
});
