// A changelog module that opts into categorized mode but does not provide the
// rest of the categorized interface.

export const categories = ['Added', 'Added', '', 'Fixed'];

export const getReleaseLine = async (): Promise<string> => 'Added: works';

export const getDependencyReleaseLine = async (): Promise<string> => '';
