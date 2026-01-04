import { useState } from 'react';
import type { ChangeEvent } from 'react';

export function useForm<T extends Record<string, any>>(initialValues: T) {
  const [values, setValues] = useState<T>(initialValues);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setValues((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const updateValue = (name: keyof T, value: any) => {
    setValues((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const reset = () => {
    setValues(initialValues);
  };

  return {
    values,
    handleChange,
    updateValue,
    reset,
    setValues,
  };
}
