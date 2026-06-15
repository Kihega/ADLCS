/**
 * admin.api.js — ADLCS Admin Dashboard API Client
 *
 * Wraps every /api/admin/* endpoint used by the Super Admin and
 * District Admin dashboards. Uses the shared `apiClient` axios instance
 * from auth.api.js, which already attaches the Bearer token and handles
 * silent refresh on 401.
 */

import { apiClient } from './auth.api'

// ── Overview / population ──────────────────────────────────────────────────────
export async function apiGetOverview() {
  const { data } = await apiClient.get('/admin/overview')
  return data
}

export async function apiGetPopulation(params = {}) {
  const { data } = await apiClient.get('/admin/population', { params })
  return data
}

// ── Geo lookups ───────────────────────────────────────────────────────────────
export async function apiGetRegions() {
  const { data } = await apiClient.get('/admin/geo/regions')
  return data
}
export async function apiGetDistricts(regionId) {
  const { data } = await apiClient.get('/admin/geo/districts', { params: { regionId } })
  return data
}
export async function apiGetWards(districtId) {
  const { data } = await apiClient.get('/admin/geo/wards', { params: { districtId } })
  return data
}
export async function apiGetVillages(wardId) {
  const { data } = await apiClient.get('/admin/geo/villages', { params: { wardId } })
  return data
}

// ── District admins [super_admin] ───────────────────────────────────────────────
export async function apiGetDistrictAdmins(params = {}) {
  const { data } = await apiClient.get('/admin/district-admins', { params })
  return data
}
export async function apiCreateDistrictAdmin(payload) {
  const { data } = await apiClient.post('/admin/district-admins', payload)
  return data
}
export async function apiUpdateDistrictAdminStatus(id, status) {
  const { data } = await apiClient.patch(`/admin/district-admins/${id}`, { status })
  return data
}
export async function apiDeleteDistrictAdmin(id) {
  const { data } = await apiClient.delete(`/admin/district-admins/${id}`)
  return data
}

// ── Village officers ─────────────────────────────────────────────────────────
export async function apiGetVillageOfficers(params = {}) {
  const { data } = await apiClient.get('/admin/village-officers', { params })
  return data
}
export async function apiCreateVillageOfficer(payload) {
  const { data } = await apiClient.post('/admin/village-officers', payload)
  return data
}
export async function apiUpdateVillageOfficerStatus(id, status) {
  const { data } = await apiClient.patch(`/admin/village-officers/${id}`, { status })
  return data
}
export async function apiDeleteVillageOfficer(id) {
  const { data } = await apiClient.delete(`/admin/village-officers/${id}`)
  return data
}

// ── Health (hospital) officers ───────────────────────────────────────────────
export async function apiGetHealthOfficers(params = {}) {
  const { data } = await apiClient.get('/admin/health-officers', { params })
  return data
}
export async function apiCreateHealthOfficer(payload) {
  const { data } = await apiClient.post('/admin/health-officers', payload)
  return data
}
export async function apiUpdateHealthOfficerStatus(id, status) {
  const { data } = await apiClient.patch(`/admin/health-officers/${id}`, { status })
  return data
}
export async function apiDeleteHealthOfficer(id) {
  const { data } = await apiClient.delete(`/admin/health-officers/${id}`)
  return data
}

// ── Manage users [super_admin] ─────────────────────────────────────────────────
export async function apiGetUsers(params = {}) {
  const { data } = await apiClient.get('/admin/users', { params })
  return data
}
export async function apiUpdateUserStatus(role, id, status) {
  const { data } = await apiClient.patch(`/admin/users/${role}/${id}`, { status })
  return data
}
export async function apiDeleteUser(role, id) {
  const { data } = await apiClient.delete(`/admin/users/${role}/${id}`)
  return data
}

// ── Audit logs / security alerts ───────────────────────────────────────────────
export async function apiGetAuditLogs(params = {}) {
  const { data } = await apiClient.get('/admin/audit-logs', { params })
  return data
}
export async function apiGetSecurityAlerts(params = {}) {
  const { data } = await apiClient.get('/admin/security-alerts', { params })
  return data
}

// ── System performance [super_admin] ─────────────────────────────────────────────
export async function apiGetSystemPerformance() {
  const { data } = await apiClient.get('/admin/system-performance')
  return data
}

// ── Migrations / marriages ───────────────────────────────────────────────────
export async function apiGetMigrations(params = {}) {
  const { data } = await apiClient.get('/admin/migrations', { params })
  return data
}
export async function apiGetMarriages(params = {}) {
  const { data } = await apiClient.get('/admin/marriages', { params })
  return data
}

// ── Change password (self) ─────────────────────────────────────────────────────
export async function apiChangePassword(currentPassword, newPassword) {
  const { data } = await apiClient.post('/auth/change-password', { currentPassword, newPassword })
  return data
}
