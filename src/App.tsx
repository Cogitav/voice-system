import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";

// Pages
import Index from "./pages/Index";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import PublicChatPage from "./pages/PublicChatPage";
import AdminDashboard from "./pages/admin/AdminDashboard";
import EmpresasPage from "./pages/admin/EmpresasPage";
import UtilizadoresPage from "./pages/admin/UtilizadoresPage";
import AgentesPage from "./pages/admin/AgentesPage";
import AgenteDetailPage from "./pages/admin/AgenteDetailPage";
import KnowledgeBasePage from "./pages/admin/KnowledgeBasePage";
import AdminChamadasPage from "./pages/admin/ChamadasPage";
import ChamadaDetailPage from "./pages/admin/ChamadaDetailPage";
import AgendamentosPage from "./pages/admin/AgendamentosPage";
import CalendarPage from "./pages/admin/CalendarPage";
import ResourcesPage from "./pages/admin/ResourcesPage";
import EmailTemplatesPage from "./pages/admin/EmailTemplatesPage";
import FollowUpRulesPage from "./pages/admin/FollowUpRulesPage";
import ConfiguracoesPage from "./pages/admin/ConfiguracoesPage";
import AdminRelatoriosPage from "./pages/admin/RelatoriosPage";
import AdminConversationReportsPage from "./pages/admin/ConversationReportsPage";
import CreditsUsagePage from "./pages/CreditsUsagePage";
import AdminConversationsPage from "./pages/admin/ConversationsPage";
import WidgetsPage from "./pages/admin/WidgetsPage";
import MaintenancePage from "./pages/admin/MaintenancePage";
import ClienteDashboard from "./pages/cliente/ClienteDashboard";
import ClienteConversationsPage from "./pages/cliente/ConversationsPage";
import ClienteChamadasPage from "./pages/cliente/ChamadasPage";
import ClienteAgendamentosPage from "./pages/cliente/AgendamentosPage";
import ClienteRelatoriosPage from "./pages/cliente/RelatoriosPage";
import ClienteConversationReportsPage from "./pages/cliente/ConversationReportsPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/chat/:empresa_slug" element={<PublicChatPage />} />
            
            {/* Root redirect */}
            <Route path="/" element={<Index />} />
            
            {/* Admin routes */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/empresas"
              element={
                <ProtectedRoute requiredRole="admin">
                  <EmpresasPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/utilizadores"
              element={
                <ProtectedRoute requiredRole="admin">
                  <UtilizadoresPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/agentes"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AgentesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/agentes/:id"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AgenteDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/conhecimento"
              element={
                <ProtectedRoute requiredRole="admin">
                  <KnowledgeBasePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/chamadas"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminChamadasPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/chamadas/:id"
              element={
                <ProtectedRoute requiredRole="admin">
                  <ChamadaDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/agendamentos"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AgendamentosPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/calendar"
              element={
                <ProtectedRoute requiredRole="admin">
                  <CalendarPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/recursos"
              element={
                <ProtectedRoute requiredRole="admin">
                  <ResourcesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/email-templates"
              element={
                <ProtectedRoute requiredRole="admin">
                  <EmailTemplatesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/follow-up-rules"
              element={
                <ProtectedRoute requiredRole="admin">
                  <FollowUpRulesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/relatorios"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminRelatoriosPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/relatorios-conversas"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminConversationReportsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/configuracoes"
              element={
                <ProtectedRoute requiredRole="admin">
                  <ConfiguracoesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/creditos"
              element={
                <ProtectedRoute requiredRole="admin">
                  <CreditsUsagePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/conversas"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminConversationsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/widgets"
              element={
                <ProtectedRoute requiredRole="admin">
                  <WidgetsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/manutencao"
              element={
                <ProtectedRoute requiredRole="admin">
                  <MaintenancePage />
                </ProtectedRoute>
              }
            />
            
            {/* Cliente routes */}
            <Route
              path="/cliente"
              element={
                <ProtectedRoute requiredRole="cliente">
                  <ClienteDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cliente/conversas"
              element={
                <ProtectedRoute requiredRole="cliente">
                  <ClienteConversationsPage />
                </ProtectedRoute>
              }
            />
            {/* Removed: agentes, conhecimento routes - clients access via admin */}
            <Route
              path="/cliente/chamadas"
              element={
                <ProtectedRoute requiredRole="cliente">
                  <ClienteChamadasPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cliente/chamadas/:id"
              element={
                <ProtectedRoute requiredRole="cliente">
                  <ChamadaDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cliente/agendamentos"
              element={
                <ProtectedRoute requiredRole="cliente">
                  <ClienteAgendamentosPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cliente/relatorios"
              element={
                <ProtectedRoute requiredRole="cliente">
                  <ClienteRelatoriosPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cliente/relatorios-conversas"
              element={
                <ProtectedRoute requiredRole="cliente">
                  <ClienteConversationReportsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cliente/creditos"
              element={
                <ProtectedRoute requiredRole="cliente">
                  <CreditsUsagePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cliente/*"
              element={
                <ProtectedRoute requiredRole="cliente">
                  <ClienteDashboard />
                </ProtectedRoute>
              }
            />
            
            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
