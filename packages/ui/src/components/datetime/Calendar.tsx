'use client';

import { DayPicker } from 'react-day-picker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../cn';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * The month grid behind every date field (ADR-048).
 *
 * This is shadcn/ui's Base UI Calendar promoted into the canonical kit: the same
 * `react-day-picker` engine and the same structure, restyled onto `--hms-*` and
 * wired to our own primitives rather than shadcn's Button and `lib/utils` (ADR-028
 * — shadcn is a reference layer, `@hms/ui` is the kit). Keeping the generated copy
 * in the app would have meant a second button system and a second `cn`.
 *
 * `react-day-picker` earns its place: an accessible month grid with roving focus,
 * keyboard navigation, disabled ranges and outside-day handling is genuinely hard
 * to get right, and getting it wrong is a clinical data-entry defect. Its own
 * `date-fns` dependency stays internal — every date the *platform* renders still
 * goes through `@hms/utils` (ADR-046).
 */
export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('hms-calendar', className)}
      components={{
        Chevron: ({ orientation, ...rest }) =>
          orientation === 'left' ? (
            <ChevronLeft size={16} strokeWidth={2} {...rest} />
          ) : (
            <ChevronRight size={16} strokeWidth={2} {...rest} />
          ),
      }}
      classNames={{
        months: 'hms-calendar__months',
        month: 'hms-calendar__month',
        month_caption: 'hms-calendar__caption',
        caption_label: 'hms-calendar__caption-label',
        nav: 'hms-calendar__nav',
        button_previous: 'hms-calendar__nav-btn',
        button_next: 'hms-calendar__nav-btn',
        month_grid: 'hms-calendar__grid',
        weekdays: 'hms-calendar__weekdays',
        weekday: 'hms-calendar__weekday',
        week: 'hms-calendar__week',
        day: 'hms-calendar__day',
        day_button: 'hms-calendar__day-btn',
        selected: 'hms-calendar__day--selected',
        range_start: 'hms-calendar__day--range-start',
        range_middle: 'hms-calendar__day--range-middle',
        range_end: 'hms-calendar__day--range-end',
        today: 'hms-calendar__day--today',
        outside: 'hms-calendar__day--outside',
        disabled: 'hms-calendar__day--disabled',
        hidden: 'hms-calendar__day--hidden',
        ...classNames,
      }}
      {...props}
    />
  );
}
