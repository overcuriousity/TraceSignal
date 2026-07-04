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
  it("flags reserved IPv4 (unspecified, multicast, broadcast) as private", () => {
    expect(isPrivateIp("0.0.0.0")).toBe(true); // unspecified
    expect(isPrivateIp("224.0.0.1")).toBe(true); // multicast
    expect(isPrivateIp("255.255.255.255")).toBe(true); // broadcast
  });
  it("flags IPv6 loopback and unique-local as private", () => {
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fd00::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
  });
  it("handles non-canonical IPv6 forms", () => {
    expect(isPrivateIp("0:0:0:0:0:0:0:1")).toBe(true); // uncompressed loopback
    expect(isPrivateIp("fe80::1%eth0")).toBe(true); // zone-suffixed link-local
    expect(isPrivateIp("FEBF::1")).toBe(true); // upper edge of fe80::/10
    expect(isPrivateIp("FC00::1")).toBe(true); // unique local, uppercase
  });
  it("does not flag public IPv6 addresses", () => {
    expect(isPrivateIp("2001:4860:4860::8888")).toBe(false);
    expect(isPrivateIp("fec0::1")).toBe(false); // site-local is outside fe80::/10
    expect(isPrivateIp("fe00::1")).toBe(false);
    expect(isPrivateIp("2001:db8::1")).toBe(false);
  });
  it("classifies IPv4-mapped IPv6 by the embedded address", () => {
    expect(isPrivateIp("::ffff:10.0.0.1")).toBe(true); // mapped RFC1918
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true); // mapped loopback
    expect(isPrivateIp("::ffff:192.168.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false); // mapped public stays public
  });
  it("flags unspecified :: and multicast ff00::/8 as private", () => {
    expect(isPrivateIp("::")).toBe(true); // unspecified
    expect(isPrivateIp("ff02::1")).toBe(true); // multicast
  });
});

describe("isIpAddress IPv6 parsing", () => {
  it("accepts valid forms including embedded IPv4 and zones", () => {
    expect(isIpAddress("::ffff:192.168.0.1")).toBe(true);
    expect(isIpAddress("fe80::1%eth0")).toBe(true);
    expect(isIpAddress("0:0:0:0:0:0:0:1")).toBe(true);
  });
  it("rejects malformed IPv6", () => {
    expect(isIpAddress(":::")).toBe(false);
    expect(isIpAddress("12345::")).toBe(false);
    expect(isIpAddress("1:2:3:4:5:6:7:8:9")).toBe(false);
    expect(isIpAddress("1:2:3:4:5:6:7")).toBe(false); // 7 groups, no ::
  });
});
