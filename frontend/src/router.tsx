import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
} from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { CasesPage } from "@/pages/CasesPage";
import { CaseOverviewPage } from "@/pages/CaseOverviewPage";
import { ExplorerPage } from "@/pages/ExplorerPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

export const router = createBrowserRouter(
  createRoutesFromElements(
    <Route element={<AppShell />}>
      <Route index element={<CasesPage />} />
      <Route path="cases/:caseId" element={<CaseOverviewPage />} />
      <Route
        path="cases/:caseId/timelines/:timelineId"
        element={<ExplorerPage />}
      />
      <Route path="*" element={<NotFoundPage />} />
    </Route>,
  ),
);
