import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { UploadPreflightContent } from "./UploadPreflightDialog";
import type { UploadPreflight } from "../../lib/upload-batch";

const preflight: UploadPreflight = {
  items: [],
  summary: { total: 4, eligible: 2, unsupported: 1, conflicts: 1 },
};

function findAction(node: React.ReactNode, action: string): React.ReactElement<Record<string, unknown>> | null {
  if (!React.isValidElement<Record<string, unknown>>(node)) return null;
  if (node.props["data-action"] === action) return node;
  for (const child of React.Children.toArray(node.props.children as React.ReactNode)) {
    const found = findAction(child, action);
    if (found) return found;
  }
  return null;
}

describe("UploadPreflightContent", () => {
  it("defaults directory review to preserve and permits flattening", () => {
    const onMappingChange = vi.fn();
    const tree = UploadPreflightContent({
      directory: true,
      mapping: "preserve",
      preflight,
      onMappingChange,
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
    });
    expect(findAction(tree, "preserve")?.props.checked).toBe(true);
    const flatten = findAction(tree, "flatten");
    expect(flatten?.props.checked).toBe(false);
    (flatten?.props.onChange as () => void)();
    expect(onMappingChange).toHaveBeenCalledWith("flatten");
  });

  it("cancels without confirming", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const tree = UploadPreflightContent({
      directory: false,
      mapping: "preserve",
      preflight,
      onMappingChange: vi.fn(),
      onCancel,
      onConfirm,
    });
    (findAction(tree, "cancel")?.props.onClick as () => void)();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("disables confirmation when every file is excluded", () => {
    const tree = UploadPreflightContent({
      directory: false,
      mapping: "preserve",
      preflight: { items: [], summary: { total: 2, eligible: 0, unsupported: 1, conflicts: 1 } },
      onMappingChange: vi.fn(),
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
    });
    expect(findAction(tree, "confirm")?.props.disabled).toBe(true);
  });
});
