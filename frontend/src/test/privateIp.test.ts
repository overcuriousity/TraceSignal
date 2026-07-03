import { describe, it, expect } from "vitest";
import { isIpAddress, isPrivateIp } from "@/lib/privateIp";

describe("isIpAddress", () => {
  it("recognizes IPv4 addresses", () => {
    expect(isIpAddress("8.8.8.8")).toBe(true);
    expect(isIpAddress("192.168.1.1")).toBe(true);
  });
  it("rejects malformed IPv4", () => {
    expect(isIpAddress("999.999.999.999")).toBe(false);
    expect(isIpAddress("not-an-ip")).toBe(false);
    expect(isIpAddress("10.0.0.1extra")).toBe(false);
  });
  it("recognizes IPv6 addresses", () => {
    expect(isIpAddress("::1")).toBe(true);
    expect(isIpAddress("2001:db8::1")).toBe(true);
  });
});

describe("isPrivateIp", () => {
  it("flags RFC1918 ranges as private", () => {
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("10.255.255.255")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("172.31.255.255")).toBe(true);
    expect(isPrivateIp("192.168.0.1")).toBe(true);
  });
  it("does not flag addresses just outside the 172.16/12 boundary", () => {
    expect(isPrivateIp("172.15.255.255")).toBe(false);
    expect(isPrivateIp("172.32.0.1")).toBe(false);
  });
  it("flags loopback and link-local as private", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("169.254.1.1")).toBe(true);
  });
  it("does not flag public IPv4 addresses", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("1.1.1.1")).toBe(false);
  });
  it("flags IPv6 loopback and unique-local as private", () => {
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fd00::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
  });
  it("does not flag public IPv6 addresses", () => {
    expect(isPrivateIp("2001:4860:4860::8888")).toBe(false);
  });
});
