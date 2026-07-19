import { Center, Loader } from "@mantine/core";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { useMe } from "./auth/useMe";
import { LandingPage } from "./pages/LandingPage";
import { StoresPage } from "./pages/StoresPage";
import { StoreDetailPage } from "./pages/StoreDetailPage";
import { AdminPage } from "./pages/AdminPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ApplicationsPage } from "./pages/ApplicationsPage";
import type { MeResponse } from "./api/client";

function HomeRedirect({ me }: { me: MeResponse }) {
  return <Navigate to={me.role === "game_owner" ? "/admin" : "/stores"} replace />;
}

export function App() {
  const meQuery = useMe();

  if (meQuery.isLoading) {
    return (
      <Center h="100vh">
        <Loader color="grape" size="lg" />
      </Center>
    );
  }

  const me = meQuery.data;
  if (!me?.authenticated) {
    return (
      <Routes>
        <Route path="*" element={<LandingPage />} />
      </Routes>
    );
  }

  return (
    <Layout me={me}>
      <Routes>
        <Route path="/" element={<HomeRedirect me={me} />} />
        <Route path="/stores" element={<StoresPage me={me} />} />
        <Route path="/stores/:code" element={<StoreDetailPage />} />
        <Route path="/applications" element={<ApplicationsPage />} />
        <Route path="/settings" element={<SettingsPage me={me} />} />
        <Route
          path="/admin"
          element={me.role === "game_owner" ? <AdminPage /> : <Navigate to="/stores" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
