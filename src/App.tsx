import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastProvider } from "./components/ui/Toast";
import { AppLayout } from "./components/layout/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { SessionsPage } from "./pages/SessionsPage";
import { PlansPage } from "./pages/PlansPage";
import { SettingsPage } from "./pages/SettingsPage";
import { useTheme } from "./hooks/useTheme";

function App() {
  useTheme();
  /*useEffect(() => {
    const init = async () => {
      // Check if liquid glass is supported (macOS 26+)
      const supported = await isGlassSupported();
      console.log("Liquid Glass supported:", supported);

      // Apply the glass effect
      await setLiquidGlassEffect({
        cornerRadius: 24,  // Match your window's corner radius
        //tintColor: "#ffffff30",  // Optional: add a color tint overlay
        variant: GlassMaterialVariant.Widgets,  // Optional: material variant (macOS 26+ only)
      });
    };
    init();
  }, []);*/
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/sessions" element={<SessionsPage />} />
              <Route path="/plans" element={<PlansPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
