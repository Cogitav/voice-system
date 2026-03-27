import { useState, useMemo, useCallback, useEffect } from 'react';
import { startOfWeek, addWeeks, subWeeks, addDays, subDays, format } from 'date-fns';
import { CalendarDays, AlertTriangle } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { CalendarHeader } from '@/components/calendar/CalendarHeader';
import { CalendarTimeGrid } from '@/components/calendar/CalendarTimeGrid';
import { CalendarSidePanel } from '@/components/calendar/CalendarSidePanel';
import { useCalendarResources, useCalendarEvents, useCalendarServices, CalendarEvent } from '@/hooks/useCalendarData';
import { useAuth } from '@/contexts/AuthContext';
import { useEmpresas } from '@/hooks/useEmpresas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function CalendarPage() {
  const { profile, isAdmin } = useAuth();
  const { data: empresas = [] } = useEmpresas();

  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [currentDate, setCurrentDate] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );

  // Empresa resolution
  const empresaId = isAdmin
    ? (selectedEmpresaId || profile?.empresa_id || null)
    : profile?.empresa_id || null;

  // Auto-select first empresa for admins without empresa_id
  useEffect(() => {
    if (isAdmin && !profile?.empresa_id && !selectedEmpresaId && empresas.length > 0) {
      setSelectedEmpresaId(empresas[0].id);
    }
  }, [isAdmin, profile?.empresa_id, selectedEmpresaId, empresas]);

  // Side panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<'create' | 'edit'>('create');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [slotDate, setSlotDate] = useState('');
  const [slotTime, setSlotTime] = useState('');
  const [slotResourceId, setSlotResourceId] = useState('');

  const dateFrom = format(currentDate, 'yyyy-MM-dd');
  const dateTo = format(
    viewMode === 'week' ? addDays(currentDate, 6) : currentDate,
    'yyyy-MM-dd'
  );

  const { data: resources = [] } = useCalendarResources(empresaId);
  const { data: events = [], isLoading } = useCalendarEvents(empresaId, dateFrom, dateTo);
  const { data: services = [] } = useCalendarServices(empresaId);

  const handlePrev = useCallback(() => {
    setCurrentDate(d => (viewMode === 'week' ? subWeeks(d, 1) : subDays(d, 1)));
  }, [viewMode]);

  const handleNext = useCallback(() => {
    setCurrentDate(d => (viewMode === 'week' ? addWeeks(d, 1) : addDays(d, 1)));
  }, [viewMode]);

  const handleToday = useCallback(() => {
    setCurrentDate(viewMode === 'week' ? startOfWeek(new Date(), { weekStartsOn: 1 }) : new Date());
  }, [viewMode]);

  const handleViewModeChange = useCallback((mode: 'week' | 'day') => {
    setViewMode(mode);
    if (mode === 'week') {
      setCurrentDate(startOfWeek(currentDate, { weekStartsOn: 1 }));
    }
  }, [currentDate]);

  const handleSlotClick = useCallback((date: string, time: string, resourceId: string) => {
    setPanelMode('create');
    setSelectedEvent(null);
    setSlotDate(date);
    setSlotTime(time);
    setSlotResourceId(resourceId);
    setPanelOpen(true);
  }, []);

  const handleEventClick = useCallback((event: CalendarEvent) => {
    setPanelMode('edit');
    setSelectedEvent(event);
    setPanelOpen(true);
  }, []);

  const handleClosePanel = useCallback(() => {
    setPanelOpen(false);
    setSelectedEvent(null);
  }, []);

  if (!empresaId) {
    console.error('[Calendar] Missing empresa_id');
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-64px)]">
        {/* Top bar */}
        <div className="px-4 sm:px-6 py-4 border-b space-y-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Calendário</h1>
            {isAdmin && empresas.length > 0 && (
              <Select
                value={empresaId || ''}
                onValueChange={(val) => setSelectedEmpresaId(val)}
              >
                <SelectTrigger className="w-[220px] ml-4">
                  <SelectValue placeholder="Selecionar empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {!empresaId ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Nenhuma empresa selecionada. Selecione uma empresa para visualizar o calendário.
              </AlertDescription>
            </Alert>
          ) : (
            <CalendarHeader
              currentDate={currentDate}
              viewMode={viewMode}
              onPrev={handlePrev}
              onNext={handleNext}
              onToday={handleToday}
              onViewModeChange={handleViewModeChange}
            />
          )}
        </div>

        {/* Body: Grid + Side Panel */}
        {empresaId && (
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-auto p-2">
              {isLoading ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  A carregar calendário...
                </div>
              ) : (
                <CalendarTimeGrid
                  currentDate={currentDate}
                  viewMode={viewMode}
                  resources={resources}
                  events={events}
                  onSlotClick={handleSlotClick}
                  onEventClick={handleEventClick}
                />
              )}
            </div>

            {panelOpen && (
              <CalendarSidePanel
                mode={panelMode}
                event={selectedEvent}
                defaultDate={slotDate}
                defaultTime={slotTime}
                defaultResourceId={slotResourceId}
                resources={resources}
                services={services}
                onClose={handleClosePanel}
              />
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
