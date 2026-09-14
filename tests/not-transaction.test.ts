import { EMPTY_EDITS, viewDraft } from '../features/lab/draft';
import { parseMessage, SAMPLES } from '../features/parser';

const promo = SAMPLES.find((s) => s.id === 's4')!;
const read = (sample: (typeof SAMPLES)[number]) =>
  parseMessage(sample.text, { sender: sample.sender });

describe('a message that is not a transaction', () => {
  it('is shown as what it is, with nothing to save', () => {
    expect(viewDraft(read(promo), EMPTY_EDITS)).toMatchObject({
      notTransaction: true,
      messageKind: 'Promotion',
    });
  });

  it('becomes a transaction once the person picks a type', () => {
    expect(viewDraft(read(promo), { ...EMPTY_EDITS, type: 'SENT' }).notTransaction).toBe(false);
  });

  it('leaves a real transaction alone', () => {
    expect(viewDraft(read(SAMPLES[0]), EMPTY_EDITS).notTransaction).toBe(false);
  });
});
