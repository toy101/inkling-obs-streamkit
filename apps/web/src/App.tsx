import { Debug } from "./components/Debug";
import { Dock } from "./components/Dock";
import { Overlay } from "./components/Overlay";

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");

  switch (view) {
    case "dock":
      return <Dock />;

    case "overlay":
      return <Overlay />;

    case "debug":
      return <Debug />;

    default:
      return (
        <main>
          <p>?view=dock / ?view=overlay / ?view=debug を指定してください</p>
        </main>
      );
  }
}
