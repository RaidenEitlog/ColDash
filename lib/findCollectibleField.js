export function findCollectibleField(registry) {
  if (registry?.collectibleField) return registry.collectibleField;
  const fields = registry?.fieldNames || [];
  return fields.find((field) => /^(amount|total amount|collectible|collectible amount|total collectible amount)$/i.test(String(field).trim())) || "";
}
