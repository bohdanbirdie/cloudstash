import { jest } from "@jest/globals";
import { vi } from "vitest";

vi.spyOn(globalThis, "fetch");
vi["spyOn"](Date, "now");
jest.spyOn(Math, "random");

const helper = { spyOn: (_target: object, _name: string) => undefined };
helper.spyOn(globalThis, "fetch");

const wrapper = (
  vi: { spyOn: (target: object, name: string) => void }
) => vi.spyOn(globalThis, "fetch");
wrapper(helper);
