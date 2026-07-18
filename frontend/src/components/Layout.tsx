import { AppShell, Avatar, Badge, Button, Group, Menu, Text, Title, UnstyledButton } from "@mantine/core";
import { IconBuildingStore, IconLogout, IconSettings, IconShieldCog } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { logout, type MeResponse } from "../api/client";

export function Layout({ me, children }: { me: MeResponse; children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const isAdmin = me.role === "admin";

  async function handleLogout() {
    await logout();
    await queryClient.invalidateQueries({ queryKey: ["me"] });
    navigate("/");
  }

  const displayName = me.user?.globalName || me.user?.username || "Account";

  return (
    <AppShell header={{ height: 64 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Text fz={26}>🏬</Text>
            <div>
              <Title order={4} lh={1}>My Lifts Mall</Title>
              <Text size="xs" c="dimmed" lh={1}>Store Owners Portal</Text>
            </div>
          </Group>

          <Group gap="xs" wrap="nowrap">
            <Button
              component={Link}
              to="/stores"
              variant={location.pathname.startsWith("/stores") ? "light" : "subtle"}
              leftSection={<IconBuildingStore size={18} />}
              visibleFrom="xs"
            >
              Stores
            </Button>
            {isAdmin && (
              <Button
                component={Link}
                to="/admin"
                variant={location.pathname.startsWith("/admin") ? "light" : "subtle"}
                leftSection={<IconShieldCog size={18} />}
                visibleFrom="xs"
              >
                Admin
              </Button>
            )}
            <Menu position="bottom-end" withArrow>
              <Menu.Target>
                <UnstyledButton>
                  <Group gap="xs" wrap="nowrap">
                    <Avatar src={me.user?.avatarUrl} radius="xl" size={34} color="grape">
                      {displayName.slice(0, 2).toUpperCase()}
                    </Avatar>
                    {isAdmin && <Badge size="xs" color="grape" visibleFrom="sm">Game owner</Badge>}
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Label>{displayName}</Menu.Label>
                {/* Navigation shortcuts — only on mobile, where the top-bar buttons are hidden. */}
                <Menu.Item component={Link} to="/stores" leftSection={<IconBuildingStore size={16} />} hiddenFrom="xs">
                  My stores
                </Menu.Item>
                {isAdmin && (
                  <Menu.Item component={Link} to="/admin" leftSection={<IconShieldCog size={16} />} hiddenFrom="xs">
                    Admin dashboard
                  </Menu.Item>
                )}
                <Menu.Item component={Link} to="/settings" leftSection={<IconSettings size={16} />}>
                  Settings
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={handleLogout}>
                  Log out
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <div className="app-backdrop">{children}</div>
      </AppShell.Main>
    </AppShell>
  );
}
