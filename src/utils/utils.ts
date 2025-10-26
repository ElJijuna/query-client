const deepEquals = (a: any, b: any): boolean  => {
  if (a === b) {
    return true;
  }

  if (typeof a !== typeof b) {
    return false;
  }

  if (typeof a === 'object' && a !== null && b !== null) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) {
      return false;
    }

    for (const key of keysA) {
      if (!deepEquals(a[key], b[key])) {
        return false;
      }
    }

    return true;
  }

  return false;
}

export const partialMatchKey = (obj1: any[], obj2: any[]) => {
  if (!Array.isArray(obj1) || !Array.isArray(obj2)) {
    return false;
  }

  return obj1.every((val, index) => obj2.length > index && deepEquals(val, obj2[index]));
}

