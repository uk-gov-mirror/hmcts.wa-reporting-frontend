export const SECTION_DATA_UNAVAILABLE_MESSAGE = 'This section is temporarily unavailable. Try again later.';
export const FILTERS_UNAVAILABLE_MESSAGE = 'Filters are temporarily unavailable. Try again later.';

export type AnalyticsSectionError = {
  message: string;
};

export type AnalyticsSectionErrors<TSection extends string = string> = Partial<Record<TSection, AnalyticsSectionError>>;
