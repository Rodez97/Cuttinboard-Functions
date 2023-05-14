export const stringArrayToMap = ({
  array,
  value,
}: {
  array?: string[];
  value?: boolean;
}): Record<string, boolean> => {
  // Check if the array is empty or is a valid array
  if (!array || !Array.isArray(array) || array.length === 0) {
    return {};
  }

  return array.reduce((acc, item) => {
    return {
      ...acc,
      [item]: value !== undefined ? value : false,
    };
  }, {});
};
