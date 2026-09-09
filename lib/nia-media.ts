export const NIA_MEDIA = [
  {
    id: 'window-v1',
    path: '/characters/nia-life-window-v1.png',
    title: 'By the window',
    description:
      'Nia smiling by a cafe window, in a navy jacket and ivory top.',
    sha256: 'c9ed4fe2106580d9677f94a8c6e7513e7cc1eb481d625b17b6024917e16965c8',
    bytes: 2081934,
  },
  {
    id: 'books-v1',
    path: '/characters/nia-life-books-v1.png',
    title: 'Between the shelves',
    description:
      'Nia holding a closed book in a bookshop, wearing a plum sweater with an amused half-smile.',
    sha256: '949e8e35c241094c75c2f799a9d039e3ac9ed1945a643cf1cf1d92b7c6c47167',
    bytes: 2062349,
  },
  {
    id: 'evening-v1',
    path: '/characters/nia-life-evening-v1.png',
    title: 'Blue hour',
    description:
      'Nia turning over her shoulder on a softly lit street at dusk, with a quiet smile.',
    sha256: '1e209b07181e38d9b8210dc7d7bcc6e92619decd8c41fc1dfb6fdb0aa65111dc',
    bytes: 2167101,
  },
] as const;
export type NiaMediaId = (typeof NIA_MEDIA)[number]['id'];
export function niaMedia(id: unknown) {
  return NIA_MEDIA.find((asset) => asset.id === id);
}
