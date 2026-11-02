import { expect, it, vi } from 'vitest';
import { waitForVisualResources } from '../src/resources';

function fixture() {
  const image = { currentSrc: 'a.png', src: 'a.png', srcset: '', sizes: '', complete: true, naturalWidth: 20, decode: vi.fn(async () => {}) };
  const target = { getBoundingClientRect() {}, ownerDocument: {}, querySelectorAll: () => [image] } as unknown as HTMLElement;
  return { image, target };
}

it('reuses successful image decodes across exact frame seeks', async () => {
  const { image, target } = fixture();
  await waitForVisualResources(target);
  await waitForVisualResources(target);
  expect(image.decode).toHaveBeenCalledTimes(1);
  image.src = 'b.png';
  await waitForVisualResources(target);
  expect(image.decode).toHaveBeenCalledTimes(2);
  image.currentSrc = 'responsive.png';
  await waitForVisualResources(target);
  expect(image.decode).toHaveBeenCalledTimes(3);
});

it('does not skip incomplete, broken or failed image decodes', async () => {
  const { image, target } = fixture();
  await waitForVisualResources(target);
  image.complete = false;
  image.decode.mockRejectedValueOnce(new Error('image failed'));
  await expect(waitForVisualResources(target)).rejects.toThrow('image failed');
  await waitForVisualResources(target);
  image.complete = true;
  image.naturalWidth = 0;
  await waitForVisualResources(target);
  expect(image.decode).toHaveBeenCalledTimes(4);
});
