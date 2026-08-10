"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { Avatar, Badge, EmptyRow, PageHeader, PageShell, Panel } from "@/components/ui";
import { EditModal } from "./EditModal";
import { TableEditor, type FieldDef } from "./TableEditor";
import { PersonProfileForm } from "./PersonProfileForm";
import { PersonTimeOffTable } from "./PersonTimeOffTable";
import { PersonScheduleForm } from "./PersonScheduleForm";
import type { ActionResult } from "@/app/settings/actions";
import { formatDate } from "@/lib/formatters";
import type {
  Employee,
  EmployeeSchedule,
  StatHoliday,
  TimeOff,
} from "@/lib/types";

const TABS = ["People", "Time Off", "Holidays"] as const;
type Tab = (typeof TABS)[number];
type SaveAction = (fd: FormData) => Promise<ActionResult>;
type EditorTarget = number | "new" | null;

/** Resolve deep-link `?person=` / `?employeeId=` to a directory row. */
function employeeIdFromParams(
  employees: Employee[],
  personParam: string | null,
  employeeIdParam: string | null
): number | null {
  if (employeeIdParam) {
    const id = Number(employeeIdParam);
    if (Number.isFinite(id) && employees.some((e) => e.id === id)) return id;
  }
  if (personParam) {
    const match = employees.find((e) => e.person === personParam);
    if (match) return match.id;
  }
  return null;
}

export function SettingsView({
  employees,
  schedules,
  timeOff,
  holidays,
  accessEnabled,
  saveEmployee,
  deleteEmployee,
  saveSchedule,
  saveTimeOff,
  deleteTimeOff,
  saveHoliday,
  deleteHoliday,
}: {
  employees: Employee[];
  schedules: EmployeeSchedule[];
  timeOff: TimeOff[];
  holidays: StatHoliday[];
  accessEnabled: boolean;
  saveEmployee: SaveAction;
  deleteEmployee: SaveAction;
  saveSchedule: SaveAction;
  saveTimeOff: SaveAction;
  deleteTimeOff: SaveAction;
  saveHoliday: SaveAction;
  deleteHoliday: SaveAction;
}) {
  const searchParams = useSearchParams();
  const personParam = searchParams.get("person");
  const employeeIdParam = searchParams.get("employeeId");

  const [tab, setTab] = useState<Tab>("People");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(
    () =>
      employeeIdFromParams(employees, personParam, employeeIdParam) ??
      employees[0]?.id ??
      null
  );
  const [addingEmployee, setAddingEmployee] = useState(false);
  const [pendingSelectPerson, setPendingSelectPerson] = useState<string | null>(
    null
  );
  const [editingTimeOffId, setEditingTimeOffId] = useState<EditorTarget>(null);
  const [editingHolidayId, setEditingHolidayId] = useState<EditorTarget>(null);
  const people = employees.map((e) => e.person);
  const selectedEmployee =
    employees.find((employee) => employee.id === selectedEmployeeId) ?? null;

  useEffect(() => {
    const fromUrl = employeeIdFromParams(
      employees,
      personParam,
      employeeIdParam
    );
    if (fromUrl == null) return;
    setTab("People");
    setAddingEmployee(false);
    setSelectedEmployeeId(fromUrl);
  }, [employees, personParam, employeeIdParam]);

  useEffect(() => {
    if (!pendingSelectPerson) return;
    const match = employees.find(
      (employee) => employee.person === pendingSelectPerson
    );
    if (match) {
      setSelectedEmployeeId(match.id);
      setPendingSelectPerson(null);
    }
  }, [employees, pendingSelectPerson]);

  const timeOffFields = (): FieldDef[] => [
    {
      key: "person",
      label: "Person",
      type: "select",
      options: people,
      grow: true,
    },
    { key: "start_date", label: "Start", type: "date" },
    { key: "end_date", label: "End", type: "date" },
    { key: "reason", label: "Reason", type: "text", grow: true, placeholder: "Vacation" },
    { key: "counts_as_working_day", label: "Counts as working day", type: "checkbox" },
    { key: "notes", label: "Notes", type: "textarea", grow: true },
  ];

  const holidayFields: FieldDef[] = [
    { key: "date", label: "Date", type: "date" },
    { key: "holiday_name", label: "Holiday", type: "text", grow: true },
    { key: "jurisdiction", label: "Jurisdiction", type: "text", defaultValue: "BC" },
    { key: "holiday_type", label: "Type", type: "text", defaultValue: "statutory" },
    { key: "counts_as_working_day", label: "Counts as working day", type: "checkbox" },
    { key: "notes", label: "Notes", type: "textarea", grow: true },
  ];

  const personSchedules = selectedEmployee
    ? schedules.filter((schedule) => schedule.person === selectedEmployee.person)
    : [];
  const currentSchedule =
    personSchedules
      .slice()
      .sort((a, b) => b.id - a.id)[0] ?? null;
  const personTimeOff = selectedEmployee
    ? timeOff.filter((entry) => entry.person === selectedEmployee.person)
    : [];

  return (
    <PageShell>
      <PageHeader title="Settings" />

      {!accessEnabled ? (
        <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-review-soft bg-review-soft px-4 py-3 text-[13px] text-[color:var(--color-review)]">
          <WarningCircleIcon
            size={18}
            weight="fill"
            aria-hidden
            className="mt-0.5 shrink-0"
          />
          <div>
            <div className="font-semibold">Settings tables are not readable yet</div>
            <p className="mt-1 text-[color:var(--color-review)]/90">
              The app connects with the read-only publishable key, and row-level
              security is blocking the employees / schedules / time-off / holidays
              tables. Enable access (service-role key or RLS policies) to manage them
              here. Analytics on Home and People already work.
            </p>
          </div>
        </div>
      ) : null}

      <nav className="mt-5 flex gap-1 border-b border-line" aria-label="Settings sections">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
              tab === t
                ? "border-brand text-ink"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="mt-5">
        {tab === "People" ? (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
            <Panel
              title="Directory"
              className="flex min-h-0 max-h-[min(70vh,640px)] flex-col lg:max-h-full"
              right={
                <button
                  type="button"
                  onClick={() => {
                    setAddingEmployee(true);
                    setSelectedEmployeeId(null);
                  }}
                  className="rounded-md bg-brand px-2.5 py-1 text-[12px] font-medium text-white transition-colors hover:bg-navy"
                >
                  Add Person
                </button>
              }
              noBodyPadding
            >
              <div className="lh-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="px-2 pt-2 pb-6">
                  {employees.map((employee) => (
                    <button
                      key={employee.id}
                      type="button"
                      onClick={() => {
                        setAddingEmployee(false);
                        setSelectedEmployeeId(employee.id);
                      }}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                        selectedEmployee?.id === employee.id && !addingEmployee
                          ? "bg-blue-1/65"
                          : "hover:bg-tint"
                      }`}
                    >
                      <Avatar name={employee.person} photoUrl={employee.photo_url} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">
                          {employee.person}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-muted">
                          {employee.active ? "Active" : "Inactive"}
                        </span>
                      </span>
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          employee.active ? "bg-positive" : "bg-line"
                        }`}
                        aria-label={employee.active ? "Active" : "Inactive"}
                      />
                    </button>
                  ))}
                  {employees.length === 0 ? <EmptyRow>No people yet.</EmptyRow> : null}
                </div>
              </div>
            </Panel>

            <div className="min-w-0 space-y-5">
              {addingEmployee || selectedEmployee ? (
                <Panel
                  title={addingEmployee ? "New Person" : "Profile"}
                  noBodyPadding
                >
                  <PersonProfileForm
                    key={
                      addingEmployee
                        ? "__new__"
                        : selectedEmployee?.id ?? "__empty__"
                    }
                    employee={addingEmployee ? null : selectedEmployee}
                    saveAction={saveEmployee}
                    deleteAction={deleteEmployee}
                    onSaved={(person) => {
                      if (addingEmployee) {
                        setAddingEmployee(false);
                        setPendingSelectPerson(person);
                      }
                    }}
                    onCancel={
                      addingEmployee
                        ? () => {
                            setAddingEmployee(false);
                            setSelectedEmployeeId(employees[0]?.id ?? null);
                          }
                        : undefined
                    }
                    onDeleted={() => {
                      setSelectedEmployeeId(null);
                      setAddingEmployee(false);
                    }}
                  />
                </Panel>
              ) : (
                <Panel title="Profile">
                  <EmptyRow>Select someone from the directory, or add a new person.</EmptyRow>
                </Panel>
              )}

              {selectedEmployee && !addingEmployee ? (
                <>
                  <Panel title="Work Schedule" noBodyPadding>
                    <PersonScheduleForm
                      key={`${selectedEmployee.person}-${selectedEmployee.active}-${currentSchedule?.id ?? "new"}`}
                      person={selectedEmployee.person}
                      active={selectedEmployee.active}
                      schedule={currentSchedule}
                      saveAction={saveSchedule}
                    />
                  </Panel>

                  <Panel
                    title="Time Off"
                    right={
                      <span className="text-[12px] text-muted">
                        {personTimeOff.length}{" "}
                        {personTimeOff.length === 1 ? "entry" : "entries"}
                      </span>
                    }
                    noBodyPadding
                  >
                    <PersonTimeOffTable
                      person={selectedEmployee.person}
                      rows={personTimeOff}
                      saveAction={saveTimeOff}
                      deleteAction={deleteTimeOff}
                    />
                  </Panel>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {tab === "Time Off" ? (
          <Panel
            title="Time Off"
            right={
              <button
                type="button"
                onClick={() => setEditingTimeOffId("new")}
                className="rounded-md bg-brand px-2.5 py-1 text-[12px] font-medium text-white transition-colors hover:bg-navy"
              >
                Add time off
              </button>
            }
            noBodyPadding
          >
            <TimeOffTable
              rows={timeOff}
              selectedId={typeof editingTimeOffId === "number" ? editingTimeOffId : null}
              onSelect={setEditingTimeOffId}
            />
            {editingTimeOffId !== null ? (
              <EditModal
                title={editingTimeOffId === "new" ? "Add Time Off" : "Edit Time Off"}
                onClose={() => setEditingTimeOffId(null)}
              >
                <TableEditor
                  key={editingTimeOffId === "new" ? "__new__" : editingTimeOffId}
                  fields={timeOffFields()}
                  rows={
                    typeof editingTimeOffId === "number"
                      ? timeOff.filter((entry) => entry.id === editingTimeOffId)
                      : []
                  }
                  saveAction={saveTimeOff}
                  deleteAction={deleteTimeOff}
                  addLabel="Add time off"
                  showNew={editingTimeOffId === "new"}
                  layout="form"
                  onSaved={() => setEditingTimeOffId(null)}
                  onCancel={() => setEditingTimeOffId(null)}
                  onDeleted={() => setEditingTimeOffId(null)}
                />
              </EditModal>
            ) : null}
          </Panel>
        ) : null}

        {tab === "Holidays" ? (
          <Panel
            title="Stat holidays"
            right={
              <button
                type="button"
                onClick={() => setEditingHolidayId("new")}
                className="rounded-md bg-brand px-2.5 py-1 text-[12px] font-medium text-white transition-colors hover:bg-navy"
              >
                Add holiday
              </button>
            }
            noBodyPadding
          >
            <HolidayTable
              rows={holidays}
              selectedId={typeof editingHolidayId === "number" ? editingHolidayId : null}
              onSelect={setEditingHolidayId}
            />
            {editingHolidayId !== null ? (
              <EditModal
                title={editingHolidayId === "new" ? "Add Holiday" : "Edit Holiday"}
                onClose={() => setEditingHolidayId(null)}
              >
                <TableEditor
                  key={editingHolidayId === "new" ? "__new__" : editingHolidayId}
                  fields={holidayFields}
                  rows={
                    typeof editingHolidayId === "number"
                      ? holidays.filter((holiday) => holiday.id === editingHolidayId)
                      : []
                  }
                  saveAction={saveHoliday}
                  deleteAction={deleteHoliday}
                  addLabel="Add holiday"
                  showNew={editingHolidayId === "new"}
                  layout="form"
                  onSaved={() => setEditingHolidayId(null)}
                  onCancel={() => setEditingHolidayId(null)}
                  onDeleted={() => setEditingHolidayId(null)}
                />
              </EditModal>
            ) : null}
          </Panel>
        ) : null}
      </div>
    </PageShell>
  );
}

function TimeOffTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: TimeOff[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="lh-scroll overflow-x-auto">
      <table className="lh-table">
        <thead>
          <tr>
            <th>Person</th>
            <th>Dates</th>
            <th>Reason</th>
            <th>Working day</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <tr key={entry.id} className={selectedId === entry.id ? "!bg-blue-1/45" : ""}>
              <td className="font-medium text-ink">{entry.person}</td>
              <td className="whitespace-nowrap">
                {formatDate(entry.start_date)} – {formatDate(entry.end_date)}
              </td>
              <td>{entry.reason}</td>
              <td>
                <Badge tone={entry.counts_as_working_day ? "review" : "neutral"}>
                  {entry.counts_as_working_day ? "Yes" : "No"}
                </Badge>
              </td>
              <td className="text-right">
                <button
                  type="button"
                  onClick={() => onSelect(entry.id)}
                  className="text-[12px] font-medium text-brand-600 hover:underline"
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5}>
                <EmptyRow>No time off entries yet.</EmptyRow>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function HolidayTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: StatHoliday[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="lh-scroll overflow-x-auto">
      <table className="lh-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Holiday</th>
            <th>Jurisdiction</th>
            <th>Type</th>
            <th>Working day</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((holiday) => (
            <tr key={holiday.id} className={selectedId === holiday.id ? "!bg-blue-1/45" : ""}>
              <td className="whitespace-nowrap">{formatDate(holiday.date)}</td>
              <td className="font-medium text-ink">{holiday.holiday_name}</td>
              <td>{holiday.jurisdiction ?? "—"}</td>
              <td className="capitalize">{holiday.holiday_type ?? "—"}</td>
              <td>
                <Badge tone={holiday.counts_as_working_day ? "review" : "neutral"}>
                  {holiday.counts_as_working_day ? "Yes" : "No"}
                </Badge>
              </td>
              <td className="text-right">
                <button
                  type="button"
                  onClick={() => onSelect(holiday.id)}
                  className="text-[12px] font-medium text-brand-600 hover:underline"
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6}>
                <EmptyRow>No holidays yet.</EmptyRow>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
