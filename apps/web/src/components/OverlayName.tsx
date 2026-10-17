import { useLayoutEffect, useRef } from "react";

type OverlayNameProps = {
  name: string;
  className: string;
  as?: "strong" | "h1" | "h2";
};

export function OverlayName({ name, className, as: Tag = "strong" }: OverlayNameProps) {
  const containerRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    const fit = () => {
      text.style.fontSize = "";
      const style = getComputedStyle(container);
      const availableWidth = container.getBoundingClientRect().width -
        Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight) -
        Number.parseFloat(style.borderLeftWidth) - Number.parseFloat(style.borderRightWidth);
      if (
        availableWidth <= 0 ||
        text.getBoundingClientRect().width <= availableWidth
      ) return;

      let minimum = 0;
      let maximum = Number.parseFloat(style.fontSize);
      for (let step = 0; step < 12; step += 1) {
        const fontSize = (minimum + maximum) / 2;
        text.style.fontSize = `${fontSize}px`;
        if (text.getBoundingClientRect().width <= availableWidth) {
          minimum = fontSize;
        } else {
          maximum = fontSize;
        }
      }
      text.style.fontSize = `${minimum}px`;
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    document.fonts.addEventListener("loadingdone", fit);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", fit);
    };
  }, [name, Tag]);

  return (
    <Tag className={className} ref={(element: HTMLElement | null) => { containerRef.current = element; }}>
      <span className="overlay-name-text" ref={textRef}>
        {name}
      </span>
    </Tag>
  );
}
