export const stringArrayToMap = (array: string[], value?: boolean) => {
  // Check if the array is empty or is a valid array
  if (!array || !Array.isArray(array) || array.length === 0) {
    return null;
  }

  const map: Record<string, boolean> = {};

  array.forEach((item) => {
    map[item] = value !== undefined ? value : false;
  });

  return map;
};
