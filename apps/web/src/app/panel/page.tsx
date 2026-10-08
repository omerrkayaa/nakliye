import { redirect } from "next/navigation";

// P2 gösterge paneli gelene kadar panel girişi ilanlara açılır
export default function PanelHome() {
  redirect("/panel/ilanlar");
}
