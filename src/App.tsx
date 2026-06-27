import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Categories from "./pages/Categories";
import Actuals from "./pages/Actuals";
import ActualsList from "./pages/ActualsList";
import Settings from "./pages/Settings";
import "./App.css";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="categories" element={<Categories />} />
        <Route path="actuals" element={<Actuals />} />
        <Route path="actuals/list" element={<ActualsList />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default App;
