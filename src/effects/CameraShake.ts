export class CameraShake {
  private trauma = 0;

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number): { x: number; y: number } {
    if (this.trauma <= 0) return { x: 0, y: 0 };
    this.trauma = Math.max(0, this.trauma - dt * 2.2);
    const shake = this.trauma * this.trauma;
    const maxOffset = 18;
    return {
      x: (Math.random() * 2 - 1) * maxOffset * shake,
      y: (Math.random() * 2 - 1) * maxOffset * shake,
    };
  }
}
