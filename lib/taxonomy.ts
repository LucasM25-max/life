export const COL_XR_CHECKLIST = '7ddf754f-d193-4cc9-b351-99906754a03b';
export const displayTaxonName = (taxon: { commonNames?: Array<{ name: string }>; canonicalName: string }) => taxon.commonNames?.[0]?.name || taxon.canonicalName;
