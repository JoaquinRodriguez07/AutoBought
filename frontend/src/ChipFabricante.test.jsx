import { render, screen } from "@testing-library/react";
import ChipFabricante from "./ChipFabricante";

describe("ChipFabricante", () => {
  it("shows the manufacturer over the photo", () => {
    render(<ChipFabricante fabricante="Bosch" />);

    expect(screen.getByText("Bosch")).toBeInTheDocument();
  });

  it("renders nothing without a manufacturer", () => {
    const { container } = render(<ChipFabricante fabricante="" />);

    expect(container).toBeEmptyDOMElement();
  });
});
