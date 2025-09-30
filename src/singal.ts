export class Signal<T> extends EventTarget {
  #value: T;

  constructor(value: any) {
    super();
    this.#value = value;
  }

  get value() {
    return this.#value;
  }

  set value(newValue) {
    const nextValue = typeof newValue === 'function' ? newValue(this.#value) : newValue;

    if (nextValue === this.#value) {
      return;
    }

    this.#value = newValue;
    this.dispatchEvent(new CustomEvent<T>('change', { detail: this.#value }));
  }

  subscribe(callback: (value: CustomEvent<T>) => void) {
    this.addEventListener('change', (event) => callback(event as CustomEvent<T>));
  }
}