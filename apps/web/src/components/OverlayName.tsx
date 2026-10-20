import { useLayoutEffect, useRef } from "react";

type OverlayNameProps = {
  name: string;
  className: string;
  as?: "strong" | "h1" | "h2";
};

const FIT_CACHE_LIMIT = 8;

export function OverlayName({ name, className, as: Tag = "strong" }: OverlayNameProps) {
  const containerRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const fitCacheRef = useRef(new Map<string, string>());

  useLayoutEffect(() => {
    const container = containerRef.current;
    const text = textRef.current;
    if (!container || !text) return;

    const cache = fitCacheRef.current;
    const fit = (observedWidth: number | null = null) => {
      const style = getComputedStyle(container);
      const availableWidth = observedWidth ?? (container.getBoundingClientRect().width -
        Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight) -
        Number.parseFloat(style.borderLeftWidth) - Number.parseFloat(style.borderRightWidth));
      if (availableWidth <= 0) return;

      const textStyle = getComputedStyle(text);
      const key = JSON.stringify([
        name, Tag, availableWidth, style.fontSize,
        textStyle.fontFamily, textStyle.fontWeight, textStyle.fontStyle,
        textStyle.fontStretch, textStyle.fontVariant, textStyle.fontFeatureSettings,
        textStyle.fontVariationSettings, textStyle.fontKerning, textStyle.fontOpticalSizing,
        textStyle.fontSizeAdjust, textStyle.letterSpacing, textStyle.wordSpacing,
        textStyle.textTransform, textStyle.textRendering, textStyle.direction,
      ]);
      if (cache.has(key)) {
        const cachedSize = cache.get(key) ?? "";
        if (text.style.fontSize !== cachedSize) text.style.fontSize = cachedSize;
        cache.delete(key);
        cache.set(key, cachedSize);
        return;
      }

      const remember = () => {
        cache.set(key, text.style.fontSize);
        if (cache.size > FIT_CACHE_LIMIT) {
          const oldest = cache.keys().next();
          if (!oldest.done) cache.delete(oldest.value);
        }
      };
      if (text.style.fontSize !== "") text.style.fontSize = "";
      let measuredWidth = text.getBoundingClientRect().width;
      if (measuredWidth <= availableWidth) {
        remember();
        return;
      }

      // Keep the same size grid as the original 12-step search, including rounding.
      const baseSize = Number.parseFloat(style.fontSize);
      const divisions = 4096;
      let minimum = 0;
      let maximum = divisions;
      let previousStep = divisions;
      let previousWidth = measuredWidth;
      let step = Math.max(1, Math.min(divisions - 1,
        Math.floor(divisions * availableWidth / measuredWidth)));

      // Correct the estimate, check nearby rounded sizes, then bisect if necessary.
      for (let attempt = 0; attempt < 18; attempt += 1) {
        text.style.fontSize = `${baseSize * step / divisions}px`;
        measuredWidth = text.getBoundingClientRect().width;
        if (measuredWidth <= availableWidth) {
          minimum = step;
        } else {
          maximum = step;
        }
        if (maximum - minimum <= 1) break;

        const slope = (measuredWidth - previousWidth) / (step - previousStep);
        let estimate = Math.floor((minimum + maximum) / 2);
        if (attempt < 2 && Number.isFinite(slope) && slope > 0) {
          estimate = Math.floor(step + (availableWidth - measuredWidth) / slope);
        } else if (attempt < 5) {
          estimate = step + (measuredWidth <= availableWidth ? 1 : -1);
        }
        previousStep = step;
        previousWidth = measuredWidth;
        step = Math.max(minimum + 1, Math.min(maximum - 1, estimate));
      }
      text.style.fontSize = `${baseSize * minimum / divisions}px`;
      remember();
    };

    fit();
    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((candidate) => candidate.target === container);
      if (entry) fit(entry.contentRect.width);
    });
    observer.observe(container);
    const fontsLoaded = () => {
      cache.clear();
      fit();
    };
    document.fonts.addEventListener("loadingdone", fontsLoaded);
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", fontsLoaded);
    };
  }, [name, Tag, className]);

  return (
    <Tag className={className} ref={(element: HTMLElement | null) => { containerRef.current = element; }}>
      <span className="overlay-name-text" ref={textRef}>
        {name}
      </span>
    </Tag>
  );
}
