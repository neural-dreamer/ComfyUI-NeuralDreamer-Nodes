// Neural Dreamer Nodes — ND Outfit Builder icons: one line drawing per slot.
// They use the button's text color.

const ico = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ZONE_ICONS = {
    style: ico('<path d="M12 3l2.4 5.6L20.5 9.5l-4.6 4 1.4 6-5.3-3.3-5.3 3.3 1.4-6-4.6-4 6.100-.9z"/>'),
    head: ico('<path d="M6 14c0-4.500 2.500-8 6-8s6 3.500 6 8"/><path d="M3 14.500h18c0 2-4 3.500-9 3.500s-9-1.500-9-3.500z"/><path d="M6.500 12.500h11"/>'),
    top: ico('<path d="M8.500 4L3 7l2.500 4.500L8 10.500V20h8v-9.500l2.500 1L21 7l-5.500-3c-.7 1.600-2 2.400-3.500 2.400S9.200 5.600 8.500 4z"/>'),
    outer: ico('<path d="M9 4L3 7l1.500 12.500H8V9.500"/><path d="M15 4l6 3-1.500 12.500H16V9.500"/><path d="M9 4c.8 1.600 1.800 2.200 3 2.200S14.200 5.600 15 4"/><path d="M12 6.200V20"/>'),
    onepiece: ico('<path d="M9 3h6l.4 5L18 21H6l2.600-13z"/><path d="M8.600 8h6.800"/><path d="M9 3c.4 1.600 1.400 2.200 3 2.200S14.600 4.600 15 3"/>'),
    bottom: ico('<path d="M6.500 3h11l1 18h-4.300L12 10l-2.200 11H5.500z"/><path d="M6.500 6.500h11"/>'),
    underwear: ico('<path d="M3 8c3.200 0 5 1.200 5 4 0 2.600-2 4-4.200 4-1 0-1.800-.6-1.800-1.800z"/><path d="M21 8c-3.200 0-5 1.200-5 4 0 2.600 2 4 4.200 4 1 0 1.800-.6 1.800-1.800z"/><path d="M8 12.500c2.600 1.400 5.400 1.400 8 0"/><path d="M6 19h12l-2 2h-8z"/>'),
    legwear: ico('<path d="M8 3h7v10l4 3.500V21H9l-1-3z"/><path d="M8 6.500h7"/><path d="M12 14l3 2.500"/>'),
    footwear: ico('<path d="M3 17c0-3 .8-5 2.800-6L9 9.500V4h5v6l6 3c1.700.9 2 2.200 2 3.500V18H3z"/><path d="M3 15.500h19"/>'),
    hands: ico('<path d="M8 21v-5l-3.200-4.300c-1-1.500.6-3.200 2.200-2.200L9 11V5.500c0-1.500 2-1.500 2 0V10V4.500c0-1.500 2-1.500 2 0V10V5c0-1.500 2-1.500 2 0v6V7.500c0-1.500 2-1.500 2 0V14c0 3-1.500 5-3 7z"/>'),
    accessories: ico('<path d="M4.500 4c0 9 3 14 7.500 14s7.500-5 7.500-14"/><circle cx="12" cy="20.500" r="1.800"/><path d="M12 18v.8"/>'),
};
export const OPTION_ICONS = {};
