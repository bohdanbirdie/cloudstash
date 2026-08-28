import { jest } from "@jest/globals";
import { vi } from "vitest";

vi.mock("one");
vi.doMock("two");
vi["unstable_mockModule"]("three");
jest.mock("four");

const helper = { mock: (_name: string) => undefined };
helper.mock("allowed");

const wrapper = (vi: { mock: (name: string) => void }) => vi.mock("allowed");
wrapper(helper);
