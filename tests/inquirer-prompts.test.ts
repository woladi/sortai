import { describe, expect, it } from 'vitest';
import { render } from '@inquirer/testing';
import select from '@inquirer/select';
import input from '@inquirer/input';
import confirm from '@inquirer/confirm';

/**
 * Wzorzec testowania interaktywnych promptów @inquirer/prompts.
 *
 * Funkcje ask* w src/wizard/index.ts są thin wrappers nad select/input/confirm
 * z @inquirer/prompts — żeby je przetestować end-to-end trzeba je wyeksportować
 * pojedynczo. Tu pokazujemy wzorzec na bezpośrednim wywołaniu prompt-factory.
 */
describe('@inquirer/testing — wzorzec', () => {
  it('select: nawigacja strzałkami i wybór', async () => {
    const { answer, events } = await render(select, {
      message: 'Tryb pracy',
      choices: [
        { name: 'Tagowanie', value: 'tag' },
        { name: 'Sortowanie', value: 'organize' },
        { name: 'Tagowanie + sortowanie', value: 'tag+organize' },
      ],
    });

    events.keypress('down');
    events.keypress('enter');

    expect(await answer).toBe('organize');
  });

  it('input: wpisanie tekstu', async () => {
    const { answer, events } = await render(input, {
      message: 'Folder',
      default: '~/Desktop',
    });

    events.type('/tmp/test');
    events.keypress('enter');

    expect(await answer).toBe('/tmp/test');
  });

  it('input: akceptacja domyślnej wartości przez Enter', async () => {
    const { answer, events } = await render(input, {
      message: 'Folder',
      default: '~/Desktop',
    });

    events.keypress('enter');

    expect(await answer).toBe('~/Desktop');
  });

  it('confirm: "y" + enter → true', async () => {
    const { answer, events } = await render(confirm, {
      message: 'Uruchomić teraz?',
      default: false,
    });

    events.type('y');
    events.keypress('enter');

    expect(await answer).toBe(true);
  });

  it('confirm: tylko enter → bierze default', async () => {
    const { answer, events } = await render(confirm, {
      message: 'Uruchomić teraz?',
      default: true,
    });

    events.keypress('enter');

    expect(await answer).toBe(true);
  });

  it('select: pokazuje wszystkie opcje na ekranie', async () => {
    const { events, getScreen } = await render(select, {
      message: 'Provider',
      choices: [
        { name: 'Ollama', value: 'ollama' },
        { name: 'Anthropic', value: 'anthropic' },
        { name: 'OpenAI', value: 'openai' },
      ],
    });

    const screen = getScreen();
    expect(screen).toContain('Ollama');
    expect(screen).toContain('Anthropic');
    expect(screen).toContain('OpenAI');

    events.keypress('enter');
  });
});
