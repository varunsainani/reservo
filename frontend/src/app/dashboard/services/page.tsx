"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Pencil, Trash2, Clock, Scissors } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RoleGuard } from "@/components/role-guard";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/modal";
import {
  LoadingState,
  ErrorState,
  EmptyState,
  Spinner,
  useErrorMessage,
} from "@/components/states";
import {
  listMyServices,
  createMyService,
  updateMyService,
  deleteMyService,
} from "@/lib/api";
import { useFormat } from "@/lib/format";
import type { Service, Currency } from "@/lib/api-types";

const CURRENCIES: Currency[] = ["BRL", "ARS", "MXN", "USD"];

interface FormState {
  id?: string;
  name: string;
  description: string;
  durationMin: string;
  price: string; // major units in the input; converted to cents on save
  currency: Currency;
  active: boolean;
  sortOrder: string;
}

const emptyForm: FormState = {
  name: "",
  description: "",
  durationMin: "30",
  price: "",
  currency: "BRL",
  active: true,
  sortOrder: "0",
};

function ServicesInner() {
  const t = useTranslations("services");
  const tc = useTranslations("common");
  const fmt = useFormat();
  const errMsg = useErrorMessage();

  const [items, setItems] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listMyServices();
      setItems(data.items.sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [errMsg]);

  useEffect(() => {
    load();
  }, [load]);

  function openNew() {
    setFieldErrors({});
    setFormError(null);
    setEditing({ ...emptyForm });
  }

  function openEdit(s: Service) {
    setFieldErrors({});
    setFormError(null);
    setEditing({
      id: s.id,
      name: s.name,
      description: s.description ?? "",
      durationMin: String(s.durationMin),
      price: (s.priceCents / 100).toString(),
      currency: s.currency,
      active: s.active,
      sortOrder: String(s.sortOrder),
    });
  }

  function validate(f: FormState) {
    const errs: Record<string, string> = {};
    if (!f.name.trim()) errs.name = t("validationName");
    const dur = Number(f.durationMin);
    if (!Number.isFinite(dur) || dur < 5) errs.durationMin = t("validationDuration");
    const price = Number(f.price);
    if (!Number.isFinite(price) || price < 0 || f.price.trim() === "") errs.price = t("validationPrice");
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function save() {
    if (!editing) return;
    setFormError(null);
    if (!validate(editing)) return;
    setSaving(true);
    const payload = {
      name: editing.name.trim(),
      description: editing.description.trim() || undefined,
      durationMin: Math.round(Number(editing.durationMin)),
      priceCents: Math.round(Number(editing.price) * 100),
      currency: editing.currency,
      active: editing.active,
      sortOrder: Math.round(Number(editing.sortOrder) || 0),
    };
    try {
      if (editing.id) await updateMyService(editing.id, payload);
      else await createMyService(payload);
      setEditing(null);
      await load();
    } catch (e) {
      setFormError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteMyService(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setFormError(errMsg(e));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            {t("addService")}
          </Button>
        }
      />

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          description={t("emptyBody")}
          icon={<Scissors className="h-5 w-5" />}
          action={
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              {t("addService")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <Card key={s.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-foreground">{s.name}</p>
                  {!s.active && <Badge tone="neutral">{t("inactive")}</Badge>}
                </div>
                {s.description && (
                  <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{s.description}</p>
                )}
                <p className="mt-1 inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {s.durationMin} min · {fmt.money(s.priceCents, s.currency)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="icon" variant="ghost" aria-label={tc("edit")} onClick={() => openEdit(s)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={tc("delete")}
                  onClick={() => setDeleteTarget(s)}
                >
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / edit modal */}
      <Modal
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        title={editing?.id ? t("editService") : t("newService")}
      >
        {editing && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="s-name">{t("name")}</Label>
              <Input
                id="s-name"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder={t("namePlaceholder")}
              />
              {fieldErrors.name && <p className="mt-1 text-xs text-danger">{fieldErrors.name}</p>}
            </div>
            <div>
              <Label htmlFor="s-desc">{t("description")}</Label>
              <Textarea
                id="s-desc"
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder={t("descriptionPlaceholder")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="s-dur">{t("duration")}</Label>
                <Input
                  id="s-dur"
                  type="number"
                  min={5}
                  step={5}
                  value={editing.durationMin}
                  onChange={(e) => setEditing({ ...editing, durationMin: e.target.value })}
                />
                {fieldErrors.durationMin && (
                  <p className="mt-1 text-xs text-danger">{fieldErrors.durationMin}</p>
                )}
              </div>
              <div>
                <Label htmlFor="s-sort">{t("sortOrder")}</Label>
                <Input
                  id="s-sort"
                  type="number"
                  value={editing.sortOrder}
                  onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="s-price">{t("price")}</Label>
                <Input
                  id="s-price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={editing.price}
                  onChange={(e) => setEditing({ ...editing, price: e.target.value })}
                />
                {fieldErrors.price && <p className="mt-1 text-xs text-danger">{fieldErrors.price}</p>}
              </div>
              <div>
                <Label htmlFor="s-cur">{t("currency")}</Label>
                <Select
                  id="s-cur"
                  value={editing.currency}
                  onChange={(e) => setEditing({ ...editing, currency: e.target.value as Currency })}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                className="h-4 w-4 rounded border-input accent-[var(--primary)]"
              />
              {t("active")}
            </label>
            {formError && <p className="text-sm text-danger">{formError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" disabled={saving} onClick={() => setEditing(null)}>
                {tc("cancel")}
              </Button>
              <Button disabled={saving} onClick={save}>
                {saving ? <Spinner className="text-primary-foreground" /> : tc("save")}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        title={t("deleteConfirmTitle")}
      >
        <p className="text-sm text-muted-foreground">{t("deleteConfirmBody")}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>
            {tc("cancel")}
          </Button>
          <Button variant="danger" disabled={deleting} onClick={doDelete}>
            {deleting ? <Spinner className="text-white" /> : t("deleteAction")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

export default function ServicesPage() {
  return (
    <AppShell>
      <RoleGuard allow={["PROVIDER"]}>
        <ServicesInner />
      </RoleGuard>
    </AppShell>
  );
}
