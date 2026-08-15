"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, Users, Gift } from "lucide-react";

interface CampaignMetric {
  id: string;
  name: string;
  status: string;
  budgetTarget: number;
  totalRaised: number;
  roiPercentage: number;
  donorCount: number;
  donorAcquisitionCost: number;
}

interface Summary {
  totalBudgetTarget: number;
  totalRaised: number;
  aggregateRoiPercentage: number;
  activeCampaigns: number;
  completedCampaigns: number;
  totalCampaigns: number;
}

export default function CampaignROIPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/campaigns/analytics");

        if (!response.ok) {
          throw new Error("Failed to fetch campaign analytics");
        }

        const data = await response.json();
        setSummary(data.summary);
        setCampaigns(data.campaigns);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case "ACTIVE":
        return "bg-blue-100 text-blue-800";
      case "COMPLETED":
        return "bg-green-100 text-green-800";
      case "PAUSED":
        return "bg-yellow-100 text-yellow-800";
      case "DRAFT":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getROIColor = (roi: number): string => {
    if (roi > 0) return "text-green-600";
    if (roi < 0) return "text-red-600";
    return "text-gray-600";
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-3xl font-bold">Campaign ROI Tracking</h1>
        <div className="flex items-center justify-center h-64">
          <p className="text-gray-500">Loading campaign analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <h1 className="text-3xl font-bold">Campaign ROI Tracking</h1>
        <div className="p-4 bg-red-50 border border-red-200 rounded-md text-red-800">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Campaign ROI Tracking</h1>
        <p className="text-gray-500 mt-2">
          Monitor campaign performance and return on investment
        </p>
      </div>

      {summary && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Total Budget</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">
                      £{summary.totalBudgetTarget.toLocaleString("en-GB", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <Target className="h-8 w-8 text-indigo-500 opacity-20" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Total Raised</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">
                      £{summary.totalRaised.toLocaleString("en-GB", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <Gift className="h-8 w-8 text-green-500 opacity-20" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Aggregate ROI</p>
                    <p
                      className={`text-2xl font-bold mt-2 ${getROIColor(
                        summary.aggregateRoiPercentage
                      )}`}
                    >
                      {summary.aggregateRoiPercentage > 0 ? "+" : ""}
                      {summary.aggregateRoiPercentage}%
                    </p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-blue-500 opacity-20" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">Active Campaigns</p>
                    <p className="text-2xl font-bold text-gray-900 mt-2">
                      {summary.activeCampaigns} / {summary.totalCampaigns}
                    </p>
                  </div>
                  <Users className="h-8 w-8 text-purple-500 opacity-20" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top Performing Campaigns */}
          {campaigns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Campaign Performance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Campaign Name</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">Budget</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">Raised</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">ROI %</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">Donors</th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900">DAC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((campaign) => (
                        <tr key={campaign.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{campaign.name}</td>
                          <td className="px-4 py-3">
                            <Badge className={getStatusColor(campaign.status)}>
                              {campaign.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-600">
                            £{Number(campaign.budgetTarget).toLocaleString("en-GB", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-600">
                            £{campaign.totalRaised.toLocaleString("en-GB", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td
                            className={`px-4 py-3 text-right text-sm font-semibold ${getROIColor(
                              campaign.roiPercentage
                            )}`}
                          >
                            {campaign.roiPercentage > 0 ? "+" : ""}
                            {campaign.roiPercentage}%
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-600">{campaign.donorCount}</td>
                          <td className="px-4 py-3 text-right text-sm text-gray-600">
                            £{campaign.donorAcquisitionCost.toLocaleString("en-GB", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {campaigns.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-gray-500">No campaigns found</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
