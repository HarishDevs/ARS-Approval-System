// v1.52.2: was a click inside this element? Judged from the event's path,
// recorded when the click happened. Checking `element.contains(target)`
// later fails when the clicked item has already been removed (a picked
// option closes its own list first), which made panels close on a pick.
export function inside(event: Event, element: Element | null | undefined): boolean {
  if (!element) return false;
  return event.composedPath().includes(element) || element.contains(event.target as Node);
}
