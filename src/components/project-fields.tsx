import { PLATFORMS, PRODUCTION_TYPES } from "@/lib/tech-spec/schema";

type Props = { project?: { name: string; productionType: string; platforms: string[]; unitCount: number | null } };

export function ProjectFields({ project }: Props) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <label>
        <span>Nama project</span>
        <input name="name" required defaultValue={project?.name} />
      </label>
      <label>
        <span>Tipe produksi</span>
        <select name="productionType" defaultValue={project?.productionType}>
          {PRODUCTION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Jumlah episode / reel</span>
        <input name="unitCount" type="number" min={1} defaultValue={project?.unitCount ?? ""} />
      </label>
      <fieldset className="md:col-span-3">
        <legend className="mb-1.5 text-xs font-medium text-muted">Platform tujuan</legend>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <label key={p} className="check rounded-full border border-line px-3 py-1 has-checked:border-accent has-checked:bg-accent-soft has-checked:text-accent">
              <input type="checkbox" name="platforms" value={p} defaultChecked={project?.platforms.includes(p)} className="sr-only" /> {p}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
