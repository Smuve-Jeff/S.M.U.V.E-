import { ownsSpaceKey } from "./space-key-owner";

/**
 * The Space rule decides whether the page's play/pause runs at all, and getting
 * it wrong is silent in one direction: claim too much and a focused button's
 * native activation fires alongside the transport; yield too much and the key
 * does nothing on any canvas the user has clicked. Both were live bugs, so the
 * rule is a pure function with the two halves pinned here.
 */
describe("ownsSpaceKey", () => {
  function make(html: string): HTMLElement {
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    return host;
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("yields to the controls Space natively activates", () => {
    const host = make(`
      <button id="b">Play</button>
      <a id="a" href="#x">Link</a>
      <select id="s"><option>1</option></select>
      <details><summary id="sum">More</summary></details>
      <div id="rb" role="button">Custom</div>
      <div id="sw" role="switch">Toggle</div>
      <div id="tab" role="tab">Tab</div>
    `);

    for (const id of ["b", "a", "s", "sum", "rb", "sw", "tab"]) {
      expect(ownsSpaceKey(host.querySelector(`#${id}`))).toBe(true);
    }
  });

  it("sees through a control's own children", () => {
    const host = make(
      `<button id="b"><span id="label">Play</span></button>`,
    );
    expect(ownsSpaceKey(host.querySelector("#label"))).toBe(true);
  });

  it("claims Space on focusable surfaces that never use it", () => {
    // The reason the earlier rule was wrong: a `[tabindex]` canvas owns arrows
    // and not Space, so yielding to focusability killed the transport key on
    // every workspace the user had clicked into.
    const host = make(`
      <div id="grid" tabindex="0"></div>
      <div id="host" tabindex="-1"></div>
      <span id="plain">text</span>
    `);

    for (const id of ["grid", "host", "plain"]) {
      expect(ownsSpaceKey(host.querySelector(`#${id}`))).toBe(false);
    }
  });

  it("claims the key when nothing focused it", () => {
    expect(ownsSpaceKey(null)).toBe(false);
    expect(ownsSpaceKey(window)).toBe(false);
  });
});
