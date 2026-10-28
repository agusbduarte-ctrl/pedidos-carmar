import { Outlet } from "react-router-dom";
import Cabecera from "./Cabecera";

export default function Layout() {
  return (
    <>
      <Cabecera />
      <Outlet />
    </>
  );
}
