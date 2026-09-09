"use client";

import { useEffect, useState } from "react";
import { Moon, UserRound } from "lucide-react";

import { SettingsSection } from "@/components/settings/settings-section";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

const LANGUAGE_KEY = "atlas-ui.language";
const THEME_KEY = "atlas-ui.theme";

export function UserUiSection() {
  const [language, setLanguage] = useState("en");
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    setLanguage(window.localStorage.getItem(LANGUAGE_KEY) || "en");
    setTheme(window.localStorage.getItem(THEME_KEY) || "dark");
  }, []);

  return (
    <SettingsSection icon={<UserRound className="size-4" />} title="User / UI">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Interface language</Label>
          <Select
            value={language}
            onValueChange={(value) => {
              const next = value || "en";
              setLanguage(next);
              window.localStorage.setItem(LANGUAGE_KEY, next);
            }}
          >
            <SelectTrigger className="w-full">
              <span>English</span>
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger>
              <SelectItem value="en">English</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Theme</Label>
          <Select
            value={theme}
            onValueChange={(value) => {
              const next = value || "dark";
              setTheme(next);
              window.localStorage.setItem(THEME_KEY, next);
            }}
          >
            <SelectTrigger className="w-full">
              <span className="flex items-center gap-2">
                <Moon className="size-3.5" />
                Dark
              </span>
            </SelectTrigger>
            <SelectContent align="start" alignItemWithTrigger>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Dark background for comfortable work at any time.
          </p>
        </div>
      </div>
    </SettingsSection>
  );
}
