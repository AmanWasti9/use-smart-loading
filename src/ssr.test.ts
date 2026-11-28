// @vitest-environment node
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { useSmartLoading } from "./useSmartLoading.js";

it("renders the idle state on the server without warnings", () => {
  const consoleError = vi.spyOn(console, "error");
  function Status() {
    const { loading, isPending, data, error } = useSmartLoading({ delay: 100 });
    return createElement("p", null, JSON.stringify([loading, isPending, data, error]));
  }
  expect(typeof window).toBe("undefined");
  expect(renderToString(createElement(Status))).toBe("<p>[false,false,null,null]</p>");
  expect(consoleError).not.toHaveBeenCalled();
});
