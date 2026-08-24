import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { UploadPickerContent } from "./UploadPickerDialog";

function findAction(node: React.ReactNode, action: string): React.ReactElement<Record<string, unknown>> | null {
  if (!React.isValidElement<Record<string, unknown>>(node)) return null;
  if (node.props["data-action"] === action) return node;
  for (const child of React.Children.toArray(node.props.children as React.ReactNode)) {
    const found = findAction(child, action);
    if (found) return found;
  }
  return null;
}

describe("UploadPickerContent", () => {
  it("offers separate file and folder actions", () => {
    const onSelectFiles = vi.fn();
    const onSelectFolder = vi.fn();
    const tree = UploadPickerContent({ directorySupported: true, onSelectFiles, onSelectFolder });
    (findAction(tree, "select-files")?.props.onClick as () => void)();
    (findAction(tree, "select-folder")?.props.onClick as () => void)();
    expect(onSelectFiles).toHaveBeenCalledOnce();
    expect(onSelectFolder).toHaveBeenCalledOnce();
  });

  it("keeps file selection available when directory selection is unsupported", () => {
    const tree = UploadPickerContent({ directorySupported: false, onSelectFiles: vi.fn(), onSelectFolder: vi.fn() });
    expect(findAction(tree, "select-files")?.props.disabled).not.toBe(true);
    expect(findAction(tree, "select-folder")?.props.disabled).toBe(true);
    expect(findAction(tree, "directory-unavailable")).not.toBeNull();
  });
});
