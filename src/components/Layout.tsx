import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/", label: "ダッシュボード", end: true },
  { to: "/categories", label: "作業区分", end: false },
  { to: "/actuals", label: "実績入力", end: false },
  { to: "/settings", label: "設定", end: false },
];

function Layout() {
  return (
    <div className="app-layout">
      <nav className="app-nav">
        <ul>
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  isActive ? "nav-link active" : "nav-link"
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;
