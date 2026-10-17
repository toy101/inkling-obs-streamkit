import { useLayoutEffect, useRef } from "react";

type OverlayPlayerNameProps = {
  name: string;
  className: string;
};

export function OverlayPlayerName({ name, className }: OverlayPlayerNameProps) {
  const containerRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    const fit = () => {
      text.style.fontSize = "";
      const availableWidth = container.getBoundingClientRect().width;
      if (
        availableWidth <= 0 ||
        text.getBoundingClientRect().width <= availableWidth
      ) return;

      let minimum = 0;
      let maximum = Number.parseFloat(getComputedStyle(container).fontSize);
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
  }, [name]);

  return (
    <strong className={className} ref={containerRef}>
      <span className="overlay-player-name-text" ref={textRef}>
        {name}
      </span>
    </strong>
  );
}
