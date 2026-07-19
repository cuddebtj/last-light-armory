import { renderToStaticMarkup } from "react-dom/server";
import RootLayout, { metadata } from "./layout";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));

describe("RootLayout", () => {
  it("renders the html shell with fonts and children", () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <p>page content</p>
      </RootLayout>,
    );
    expect(html).toContain('lang="en"');
    expect(html).toContain("--font-geist-sans");
    expect(html).toContain("--font-geist-mono");
    expect(html).toContain("<p>page content</p>");
  });

  it("exports site metadata", () => {
    expect(metadata.title).toBe("Last Light Armory");
    expect(metadata.description).toContain("Destiny 2");
  });
});
