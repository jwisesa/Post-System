// Prepared options for links, versions and project documents.
export const KINDS = [
  { value: "preview", label: "Preview" },
  { value: "asset", label: "Aset" },
  { value: "document", label: "Dokumen" },
] as const;
export const kindLabel = (v: string) => KINDS.find((k) => k.value === v)?.label ?? v;

export const VERSION_STATUSES = [
  { value: "pending", label: "Menunggu review", tone: "tag-warn" },
  { value: "approved", label: "Approved", tone: "tag-ok" },
  { value: "changes_requested", label: "Perlu revisi", tone: "tag-danger" },
] as const;
export const versionStatus = (v: string) => VERSION_STATUSES.find((s) => s.value === v) ?? VERSION_STATUSES[0];

/** Suggested names for links on schedule items. */
export const LINK_LABELS = [
  "Assembly Cut", "Rough Cut", "Fine Cut", "Offline Cut", "Picture Lock Reference", "Project File / XML", "VFX Shot Review", "VFX Plates",
  "Music Demo", "Music Final", "Temp Mix", "Mix Preview", "Grade Preview", "Online Master Preview", "QC Report", "Subtitle File", "Delivery Folder",
];

/** Suggested names for project-level production documents. */
export const DOCUMENT_LABELS = [
  "Script", "Lined Script", "Script Report", "Camera Report", "Sound Report", "Grab Still", "Storyboard", "Shot List", "Call Sheet",
  "Lab / DIT Report", "Music Cue List", "Delivery Spec Sheet", "Budget Post", "Kontrak Vendor",
];

/** Suggested names for links on deliverables. */
export const DELIVERABLE_LINK_LABELS = ["File master", "Folder delivery", "Preview / screener", "QC report", "Bukti kirim", "Checksum / MD5", "Catatan revisi platform"];
