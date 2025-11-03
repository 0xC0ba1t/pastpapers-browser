"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ChevronRight, File, Folder, Home, Search, Moon, Sun, Star, Download, Clock, Filter, X, CheckCircle, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { useRouter, useSearchParams } from "next/navigation";

interface FileNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: Record<string, FileNode>;
}

interface FavoriteFile {
  name: string;
  path: string;
  addedAt: number;
}

interface RecentFile {
  name: string;
  path: string;
  accessedAt: number;
}

type SessionFilter = "all" | "m" | "s" | "w";

export default function FileBrowserClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [fileTree, setFileTree] = useState<Record<string, FileNode>>({});
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [allFilesFromCSV, setAllFilesFromCSV] = useState<string[]>([]);
  const [testResults, setTestResults] = useState<{filesInTree: number, csvFiles: number, missing: number} | null>(null);
  const [showTestResults, setShowTestResults] = useState(false);

  // New state for features
  const [favorites, setFavorites] = useState<FavoriteFile[]>([]);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [showFavorites, setShowFavorites] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [sessionFilter, setSessionFilter] = useState<SessionFilter>("all");
  const [yearRange, setYearRange] = useState({ min: 2016, max: 2025 });
  const [showFilters, setShowFilters] = useState(false);

  // Initialize path from URL on mount
  useEffect(() => {
    setMounted(true);
    const pathParam = searchParams.get('path');
    if (pathParam) {
      setCurrentPath(pathParam.split('/').filter(Boolean));
    }

    // Load favorites and recent files from localStorage
    const savedFavorites = localStorage.getItem("igcse-favorites");
    const savedRecent = localStorage.getItem("igcse-recent");

    if (savedFavorites) {
      setFavorites(JSON.parse(savedFavorites));
    }
    if (savedRecent) {
      setRecentFiles(JSON.parse(savedRecent));
    }
  }, [searchParams]);

  // Update URL when path changes
  useEffect(() => {
    if (mounted && currentPath.length > 0) {
      const pathString = currentPath.join('/');
      router.push(`?path=${encodeURIComponent(pathString)}`, { scroll: false });
    } else if (mounted && currentPath.length === 0) {
      router.push('/', { scroll: false });
    }
  }, [currentPath, mounted, router]);

  useEffect(() => {
    async function loadCSV() {
      const response = await fetch("/list_of_all_in_bucket.csv");
      const text = await response.text();

      // Normalize newlines and strip BOM if present
      const normalized = text.replace(/\uFEFF/, "");
      const lines = normalized.split(/\r?\n/).filter(line => line.trim());

      // Store all file paths for testing
      const csvFiles: string[] = [];

      const tree: Record<string, FileNode> = {};

      lines.forEach((line, idx) => {
        if (!line || !line.trim()) return;

        // Try to extract the file path robustly:
        let filePath: string | null = null;
        const quoteMatch = line.match(/"([^"]+)"/);
        if (quoteMatch) {
          filePath = quoteMatch[1];
        } else {
          const cols = line.split(",");
          filePath = cols[cols.length - 1]?.trim() ?? null;
        }

        if (!filePath) {
          console.warn(`Could not parse CSV line ${idx + 1}:`, line);
          return;
        }

        // Clean up carriage returns and whitespace
        filePath = filePath.replace(/\r$/, "").trim();

        // Store the file path
        csvFiles.push(filePath);

        const rawParts = filePath.split("/").map((p) => p.trim());
        const parts = rawParts.filter(Boolean);
        if (parts.length === 0) {
          console.warn(`Empty path after parsing on line ${idx + 1}:`, line);
          return;
        }

        let current = tree;
        parts.forEach((part, index) => {
          const isLast = index === parts.length - 1;
          if (!current[part]) {
            current[part] = {
              name: part,
              path: parts.slice(0, index + 1).join("/"),
              type: isLast ? "file" : "folder",
              children: isLast ? undefined : {},
            };
          } else {
            if (!isLast && current[part].type === "file") {
              current[part].type = "folder";
              current[part].children = {};
            }
          }

          if (current[part].children) {
            current = current[part].children!;
          }
        });
      });

      setFileTree(tree);
      setAllFilesFromCSV(csvFiles);

      // Test function to verify all files are accessible
      console.log(`📁 Total files in CSV: ${csvFiles.length}`);
      testFileTreeIntegrity(tree, csvFiles);
    }

    loadCSV();
  }, []);

  // Test function to verify all CSV files are in the tree
  const testFileTreeIntegrity = (tree: Record<string, FileNode>, csvFiles: string[]) => {
    const filesInTree = new Set<string>();

    const collectFiles = (node: Record<string, FileNode>, prefix = "") => {
      Object.values(node).forEach(item => {
        const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.type === "file") {
          filesInTree.add(fullPath);
        }
        if (item.children) {
          collectFiles(item.children, fullPath);
        }
      });
    };

    collectFiles(tree);

    console.log(`📊 Files in tree: ${filesInTree.size}`);

    const missing = csvFiles.filter(file => !filesInTree.has(file));
    if (missing.length > 0) {
      console.error(`❌ Missing ${missing.length} files from tree:`, missing.slice(0, 10));
    } else {
      console.log('✅ All CSV files are present in the tree');
    }

    setTestResults({ filesInTree: filesInTree.size, csvFiles: csvFiles.length, missing: missing.length });
    setShowTestResults(true);

    return { filesInTree: filesInTree.size, csvFiles: csvFiles.length, missing: missing.length };
  };

  const getCurrentFolder = useMemo(() => {
    let current: Record<string, FileNode> = fileTree;

    for (const pathPart of currentPath) {
      const node = current[pathPart];
      if (node?.children) {
        current = node.children;
      } else {
        return {};
      }
    }

    return current;
  }, [fileTree, currentPath]);

  const applyFilters = useCallback((items: FileNode[]) => {
    if (sessionFilter === "all" && yearRange.min === 2016 && yearRange.max === 2025) {
      return items;
    }

    return items.filter((item) => {
      if (item.type === "folder") return true;

      const path = item.path;

      // Session filter (m, s, w)
      if (sessionFilter !== "all") {
        const sessionFolderMatch = path.match(/\/([msw])\//i);
        if (sessionFolderMatch) {
          if (sessionFolderMatch[1].toLowerCase() !== sessionFilter) return false;
        } else {
          const filenameSessionMatch = path.match(/[_\-\.]([msw])[_\-\.]/i);
          if (filenameSessionMatch) {
            if (filenameSessionMatch[1].toLowerCase() !== sessionFilter) return false;
          } else {
            return false;
          }
        }
      }

      // Year filter
      const yearMatch = path.match(/\/(\d{4})(?:\/|$)/);
      if (yearMatch) {
        const year = parseInt(yearMatch[1], 10);
        if (year < yearRange.min || year > yearRange.max) {
          return false;
        }
      } else {
        return false;
      }

      return true;
    });
  }, [sessionFilter, yearRange]);

  const filteredItems = useMemo(() => {
    let items = Object.values(getCurrentFolder);

    // Apply search first (searches everything in current folder)
    if (searchQuery.trim()) {
      items = items.filter((item) =>
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.path.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Then apply filters (only filters files, not folders)
    items = applyFilters(items);

    // Sort
    return items.sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name);
      }
      return a.type === "folder" ? -1 : 1;
    });
  }, [getCurrentFolder, searchQuery, applyFilters]);

  const isFavorite = (path: string) => {
    return favorites.some((fav) => fav.path === path);
  };

  const toggleFavorite = (item: FileNode, e: React.MouseEvent) => {
    e.stopPropagation();

    const newFavorites = isFavorite(item.path)
      ? favorites.filter((fav) => fav.path !== item.path)
      : [...favorites, { name: item.name, path: item.path, addedAt: Date.now() }];

    setFavorites(newFavorites);
    localStorage.setItem("igcse-favorites", JSON.stringify(newFavorites));
  };

  const addToRecent = (item: FileNode) => {
    const newRecent = [
      { name: item.name, path: item.path, accessedAt: Date.now() },
      ...recentFiles.filter((recent) => recent.path !== item.path),
    ].slice(0, 10); // Keep only last 10

    setRecentFiles(newRecent);
    localStorage.setItem("igcse-recent", JSON.stringify(newRecent));
  };

  const handleItemClick = (item: FileNode) => {
    if (item.type === "folder") {
      setCurrentPath([...currentPath, item.name]);
      setSearchQuery("");
    } else {
      addToRecent(item);
      const url = `https://cloudflare-b2-worker.studies-c0ba1t-is-a-dev.workers.dev/${item.path}`;
      window.open(url, "_blank");
    }
  };

  const handleDownload = (item: FileNode, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `https://cloudflare-b2-worker.studies-c0ba1t-is-a-dev.workers.dev/${item.path}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = item.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const navigateToPath = (index: number) => {
    setCurrentPath(currentPath.slice(0, index));
    setSearchQuery("");
  };

  const getFileType = (filename: string) => {
    const lower = filename.toLowerCase();
    if (lower.includes("_ms_") || lower.includes("_ms.")) return "MS";
    if (lower.includes("_qp_") || lower.includes("_qp.")) return "QP";
    return "";
  };

  const formatFileName = (filename: string) => {
    const type = getFileType(filename);
    const name = filename.replace(".pdf", "");
    return { name, type };
  };

  const openFavoriteOrRecent = (path: string) => {
    const url = `https://cloudflare-b2-worker.studies-c0ba1t-is-a-dev.workers.dev/${path}`;
    window.open(url, "_blank");
  };

  const resetFilters = () => {
    setSessionFilter("all");
    setYearRange({ min: 2016, max: 2025 });
  };

  const hasActiveFilters = sessionFilter !== "all" || yearRange.min !== 2016 || yearRange.max !== 2025;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="mb-8 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                IGCSE Past Papers
              </h1>
              <p className="text-muted-foreground mt-2">Browse and access past examination papers</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowRecent(!showRecent)}
                className={`rounded-full ${showRecent ? "bg-accent" : ""}`}
                title="Recent Files"
              >
                <Clock className="h-5 w-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowFavorites(!showFavorites)}
                className={`rounded-full ${showFavorites ? "bg-accent" : ""}`}
                title="Favorites"
              >
                <Star className="h-5 w-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setShowFilters(!showFilters)}
                className={`rounded-full ${showFilters || hasActiveFilters ? "bg-accent" : ""}`}
                title="Filters"
              >
                <Filter className="h-5 w-5" />
              </Button>
              {mounted && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="rounded-full"
                >
                  {theme === "dark" ? (
                    <Sun className="h-5 w-5" />
                  ) : (
                    <Moon className="h-5 w-5" />
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Test Results Panel */}
          {showTestResults && testResults && (
            <div className={`border rounded-xl p-4 space-y-3 ${testResults.missing === 0 ? 'bg-emerald-500/10 border-emerald-500/50' : 'bg-amber-500/10 border-amber-500/50'}`}>
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  {testResults.missing === 0 ? (
                    <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  )}
                  CSV File Integrity Test
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setShowTestResults(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">CSV Files</p>
                  <p className="text-lg font-semibold">{testResults.csvFiles}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">In Tree</p>
                  <p className="text-lg font-semibold">{testResults.filesInTree}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Missing</p>
                  <p className={`text-lg font-semibold ${testResults.missing === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {testResults.missing}
                  </p>
                </div>
              </div>
              {testResults.missing === 0 ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  ✅ All CSV files are successfully loaded and accessible in the file tree
                </p>
              ) : (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  ⚠️ Some files from CSV are not visible in the tree. Check browser console for details.
                </p>
              )}
            </div>
          )}

          {/* Filters Panel */}
          {showFilters && (
            <div className="bg-card border rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Filters</h3>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={resetFilters}>
                    <X className="h-4 w-4 mr-1" />
                    Clear All
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Session Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Exam Session</label>
                  <div className="flex gap-2">
                    {[
                      { value: "all" as SessionFilter, label: "All" },
                      { value: "m" as SessionFilter, label: "March" },
                      { value: "s" as SessionFilter, label: "Summer" },
                      { value: "w" as SessionFilter, label: "Winter" },
                    ].map((session) => (
                      <Button
                        key={session.value}
                        variant={sessionFilter === session.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSessionFilter(session.value)}
                        className="flex-1"
                      >
                        {session.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Year Range Filter */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Year Range</label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="number"
                      min={2016}
                      max={2025}
                      value={yearRange.min}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setYearRange({ ...yearRange, min: parseInt(e.target.value) || 2016 })
                      }
                      className="w-24"
                    />
                    <span className="text-muted-foreground">to</span>
                    <Input
                      type="number"
                      min={2016}
                      max={2025}
                      value={yearRange.max}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setYearRange({ ...yearRange, max: parseInt(e.target.value) || 2025 })
                      }
                      className="w-24"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Favorites Panel */}
          {showFavorites && (
            <div className="bg-card border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                  Favorites ({favorites.length})
                </h3>
              </div>
              {favorites.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No favorites yet. Click the star icon on any file to add it.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {favorites.map((fav) => (
                    <button
                      key={fav.path}
                      onClick={() => openFavoriteOrRecent(fav.path)}
                      className="group flex items-center gap-2 p-2 rounded-lg border bg-background hover:bg-accent transition-colors text-left"
                    >
                      <File className="h-4 w-4 text-red-500 flex-shrink-0" />
                      <span className="text-sm truncate flex-1">{fav.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Recent Files Panel */}
          {showRecent && (
            <div className="bg-card border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Recent Files ({recentFiles.length})
                </h3>
              </div>
              {recentFiles.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No recent files yet. Open any file to see it here.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {recentFiles.map((recent) => (
                    <button
                      key={recent.path}
                      onClick={() => openFavoriteOrRecent(recent.path)}
                      className="group flex items-center gap-2 p-2 rounded-lg border bg-background hover:bg-accent transition-colors text-left"
                    >
                      <File className="h-4 w-4 text-red-500 flex-shrink-0" />
                      <span className="text-sm truncate flex-1">{recent.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search files and folders..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 text-base"
            />
          </div>

          {/* Breadcrumbs */}
          <div className="flex items-center gap-2 flex-wrap bg-muted/50 rounded-lg px-4 py-3">
            <button
              onClick={() => {
                setCurrentPath([]);
                setSearchQuery("");
              }}
              className="flex items-center gap-1 text-sm font-medium hover:text-primary transition-colors"
            >
              <Home className="h-4 w-4" />
              <span>Home</span>
            </button>
            {currentPath.map((path, index) => (
              <div key={index} className="flex items-center gap-2">
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <button
                  onClick={() => navigateToPath(index + 1)}
                  className="text-sm font-medium hover:text-primary transition-colors capitalize"
                >
                  {path}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* File Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredItems.map((item) => (
            <button
              key={item.name + "|" + item.path} // safer key to avoid collisions
              onClick={() => handleItemClick(item)}
              className="group relative flex items-center gap-3 p-4 rounded-xl border bg-card hover:bg-accent hover:border-primary/50 transition-all duration-200"
            >
              <div className={`flex-shrink-0 ${item.type === "folder" ? "text-amber-500 dark:text-amber-400" : "text-red-500 dark:text-red-400"}`}>
                {item.type === "folder" ? (
                  <Folder className="h-6 w-6" />
                ) : (
                  <File className="h-6 w-6" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate group-hover:text-primary transition-colors">
                  {item.type === "file" ? formatFileName(item.name).name : item.name}
                </div>
                {item.type === "file" && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatFileName(item.name).type === "MS" ? "Mark Scheme" : "Question Paper"}
                  </div>
                )}
              </div>
              {item.type === "file" && (
                <div className="flex-shrink-0 flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => handleDownload(item, e)}
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => toggleFavorite(item, e)}
                    title={isFavorite(item.path) ? "Remove from favorites" : "Add to favorites"}
                  >
                    <Star className={`h-4 w-4 ${isFavorite(item.path) ? "fill-amber-500 text-amber-500" : ""}`} />
                  </Button>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    formatFileName(item.name).type === "MS"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                  }`}>
                    {formatFileName(item.name).type}
                  </div>
                </div>
              )}
            </button>
          ))}
        </div>

        {filteredItems.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-lg">Loading files!</p>
            {hasActiveFilters && (
              <Button variant="outline" onClick={resetFilters} className="mt-4">
                Clear Filters
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
