import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { ArrowLeft, Trash2, PoundSterling, MapPin, Rocket, RotateCcw, ArrowLeftRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { logAudit } from "@/lib/audit";
import { SingleLocationMap } from "@/components/ui/single-location-map";
import { geocodeAddress } from "@/lib/geocode";
import { derivePostcodeArea } from "@/lib/postcode";
import { quickSetStatus, swapTin } from "../actions";

export default async function CollectionTinDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [tin, allLocations, inStockTins] = await Promise.all([
    prisma.collectionTin.findUnique({
      where: { id },
      include: {
        createdBy: true,
        location: true,
        movements: { orderBy: { date: "desc" } },
      },
    }),
    prisma.tinLocation.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.collectionTin.findMany({
      where: { status: "IN_STOCK", id: { not: id } },
      orderBy: { tinNumber: "asc" },
      select: { id: true, tinNumber: true },
    }),
  ]);

  if (!tin) notFound();

  const totalCollected = tin.movements
    .filter((m) => m.type === "COUNTED" && m.amount)
    .reduce((s, m) => s + Number(m.amount || 0), 0);
  const collectionCount = tin.movements.filter(
    (m) => m.type === "COUNTED" && m.amount
  ).length;

  const canDeploy = tin.status === "IN_STOCK" || tin.status === "RETURNED";
  const canReturn = tin.status === "DEPLOYED";

  async function updateStatus(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const newStatus = formData.get("status") as string;
    const notes = formData.get("notes") as string;

    const update: Record<string, unknown> = { status: newStatus };
    const currentTin = await prisma.collectionTin.findUnique({
      where: { id },
    });

    if (newStatus === "DEPLOYED" && !currentTin?.deployedAt) {
      update.deployedAt = new Date();
    } else if (newStatus === "RETURNED" && !currentTin?.returnedAt) {
      update.returnedAt = new Date();
    }

    await prisma.collectionTin.update({
      where: { id },
      data: update,
    });

    // Always create a movement record for status changes
    await prisma.collectionTinMovement.create({
      data: {
        tinId: id,
        type: newStatus,
        date: new Date(),
        notes: notes || `Status changed to ${newStatus}`,
      },
    });

    await logAudit({ userId: session.id, action: "UPDATE", entityType: "CollectionTin", entityId: id, details: { status: newStatus } });
    redirect(`/finance/collection-tins/${id}`);
  }

  async function recordCollection(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const amount = parseFloat(formData.get("amount") as string);
    const date = formData.get("date") as string;
    const notes = (formData.get("notes") as string) || null;

    await prisma.collectionTinMovement.create({
      data: {
        tinId: id,
        type: "COUNTED",
        date: new Date(date),
        amount,
        notes,
      },
    });

    await logAudit({ userId: session.id, action: "CREATE", entityType: "CollectionTinMovement", entityId: id, details: { amount, type: "COUNTED" } });
    redirect(`/finance/collection-tins/${id}`);
  }

  async function assignLocation(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const existingLocationId = (formData.get("locationId") as string) || null;
    const newLocationName = (formData.get("newLocationName") as string)?.trim() || null;
    const newLocationAddress = (formData.get("newLocationAddress") as string)?.trim() || null;
    const newLocationCity = (formData.get("newLocationCity") as string)?.trim() || null;
    const newLocationPostcode = (formData.get("newLocationPostcode") as string)?.trim().toUpperCase() || null;
    const newLocationType = (formData.get("newLocationType") as string) || "OTHER";

    let locationId: string | null = existingLocationId;
    let locationName = "";
    let locationAddress: string | null = null;

    if (existingLocationId) {
      const loc = await prisma.tinLocation.findUnique({
        where: { id: existingLocationId },
      });
      if (loc) {
        locationName = loc.name;
        locationAddress = loc.address;
      }
    } else if (newLocationName) {
      const fullAddress = [newLocationAddress, newLocationCity, newLocationPostcode].filter(Boolean).join(", ");
      let latitude: number | null = null;
      let longitude: number | null = null;
      if (fullAddress) {
        const coords = await geocodeAddress(fullAddress);
        if (coords) {
          latitude = coords.lat;
          longitude = coords.lng;
        }
      }
      const postcodeArea = derivePostcodeArea(newLocationPostcode);
      const newLoc = await prisma.tinLocation.create({
        data: {
          name: newLocationName,
          address: newLocationAddress,
          city: newLocationCity,
          postcode: newLocationPostcode,
          postcodeArea,
          type: newLocationType,
          latitude,
          longitude,
        },
      });
      locationId = newLoc.id;
      locationName = newLoc.name;
      locationAddress = newLoc.address;
      await logAudit({ userId: session.id, action: "CREATE", entityType: "TinLocation", entityId: newLoc.id, details: { name: newLocationName, autoCreated: true } });
    }

    if (locationId) {
      await prisma.collectionTin.update({
        where: { id },
        data: { locationId, locationName, locationAddress },
      });
    } else {
      await prisma.collectionTin.update({
        where: { id },
        data: { locationId: null, locationName: "", locationAddress: null },
      });
    }

    await logAudit({ userId: session.id, action: "UPDATE", entityType: "CollectionTin", entityId: id, details: { locationId } });
    revalidatePath(`/finance/collection-tins/${id}`);
  }

  async function editTin(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    await prisma.collectionTin.update({
      where: { id },
      data: {
        tinNumber: formData.get("tinNumber") as string,
        notes: (formData.get("notes") as string) || null,
      },
    });

    await logAudit({ userId: session.id, action: "UPDATE", entityType: "CollectionTin", entityId: id, details: { tinNumber: formData.get("tinNumber") } });
    revalidatePath(`/finance/collection-tins/${id}`);
  }

  async function deleteTin() {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    await prisma.collectionTin.delete({
      where: { id },
    });

    await logAudit({ userId: session.id, action: "DELETE", entityType: "CollectionTin", entityId: id });
    redirect("/finance/collection-tins");
  }

  const statusColors: Record<string, string> = {
    IN_STOCK: "bg-blue-100 text-blue-800",
    DEPLOYED: "bg-green-100 text-green-800",
    RETURNED: "bg-purple-100 text-purple-800",
    LOST: "bg-red-100 text-red-800",
    STOLEN: "bg-red-100 text-red-800",
    RETIRED: "bg-gray-100 text-gray-800",
  };

  const statusBgColors: Record<string, string> = {
    IN_STOCK: "border-blue-200 bg-blue-50",
    DEPLOYED: "border-green-200 bg-green-50",
    RETURNED: "border-purple-200 bg-purple-50",
    LOST: "border-red-200 bg-red-50",
    STOLEN: "border-red-200 bg-red-50",
    RETIRED: "border-gray-200 bg-gray-50",
  };

  const movementColors: Record<string, string> = {
    DEPLOYED: "bg-green-100 text-green-800",
    COLLECTED: "bg-blue-100 text-blue-800",
    COUNTED: "bg-purple-100 text-purple-800",
    LOST: "bg-red-100 text-red-800",
    STOLEN: "bg-red-100 text-red-800",
    RETURNED: "bg-purple-100 text-purple-800",
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/finance/collection-tins"
          className="text-gray-400 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          Tin {tin.tinNumber}
        </h1>
        <Badge className={statusColors[tin.status] || ""}>
          {tin.status.replace("_", " ")}
        </Badge>
      </div>

      {/* Status Bar — prominent one-click actions */}
      <Card className={statusBgColors[tin.status] || ""}>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900">
                Current Status: <span className="font-bold">{tin.status.replace("_", " ")}</span>
              </p>
              {tin.deployedAt && (
                <p className="text-xs text-gray-500 mt-1">
                  Deployed {formatDate(tin.deployedAt)}
                  {tin.location && <> at {tin.location.name}</>}
                </p>
              )}
              {tin.returnedAt && (
                <p className="text-xs text-gray-500 mt-1">
                  Returned {formatDate(tin.returnedAt)}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {canDeploy && (
                <form action={quickSetStatus}>
                  <input type="hidden" name="tinId" value={tin.id} />
                  <input type="hidden" name="status" value="DEPLOYED" />
                  <Button type="submit" className="bg-green-600 hover:bg-green-700">
                    <Rocket className="h-4 w-4 mr-2" />
                    Deploy Tin
                  </Button>
                </form>
              )}
              {canReturn && (
                <>
                  <a href="#swap-section">
                    <Button type="button" className="bg-amber-600 hover:bg-amber-700">
                      <ArrowLeftRight className="h-4 w-4 mr-2" />
                      Swap Out
                    </Button>
                  </a>
                  <form action={quickSetStatus}>
                    <input type="hidden" name="tinId" value={tin.id} />
                    <input type="hidden" name="status" value="RETURNED" />
                    <Button type="submit" variant="outline">
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Return to Stock
                    </Button>
                  </form>
                </>
              )}
              {/* Advanced status dropdown for other statuses */}
              <details className="relative">
                <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-700 underline py-2 px-1">
                  More options
                </summary>
                <div className="absolute right-0 top-8 z-10 bg-white rounded-lg shadow-lg border p-4 w-64">
                  <form action={updateStatus} className="space-y-3">
                    <select
                      name="status"
                      defaultValue={tin.status}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      required
                    >
                      <option value="IN_STOCK">In Stock</option>
                      <option value="DEPLOYED">Deployed</option>
                      <option value="RETURNED">Returned</option>
                      <option value="LOST">Lost</option>
                      <option value="STOLEN">Stolen</option>
                      <option value="RETIRED">Retired</option>
                    </select>
                    <Textarea
                      name="notes"
                      placeholder="Notes (optional)"
                      className="text-sm"
                    />
                    <Button type="submit" size="sm" className="w-full">
                      Update Status
                    </Button>
                  </form>
                </div>
              </details>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-green-600">
              £{totalCollected.toFixed(2)}
            </p>
            <p className="text-sm text-gray-500 mt-1">Total Collected</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-indigo-600">
              {collectionCount}
            </p>
            <p className="text-sm text-gray-500 mt-1">Collections</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-amber-600">
              £{collectionCount > 0 ? (totalCollected / collectionCount).toFixed(2) : "0.00"}
            </p>
            <p className="text-sm text-gray-500 mt-1">Avg per Collection</p>
          </CardContent>
        </Card>
      </div>

      {/* Record Collection - PROMINENT */}
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <PoundSterling className="h-5 w-5 text-green-600" />
            <h3 className="text-lg font-semibold text-green-900">
              Record a Collection
            </h3>
          </div>
        </CardHeader>
        <CardContent>
          <form action={recordCollection} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date *
                </label>
                <Input
                  name="date"
                  type="date"
                  defaultValue={new Date().toISOString().split("T")[0]}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount Collected (£) *
                </label>
                <Input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 25.00"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <Input
                name="notes"
                placeholder="e.g. Tin was nearly full, good location"
              />
            </div>
            <Button type="submit" className="bg-green-600 hover:bg-green-700">
              <PoundSterling className="h-4 w-4 mr-2" />
              Record Collection
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Swap Tin — shown when deployed */}
      {canReturn && (
        <div id="swap-section">
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="h-5 w-5 text-amber-600" />
              <h3 className="text-lg font-semibold text-amber-900">
                Swap Out
              </h3>
            </div>
            <p className="text-sm text-amber-700">
              Collect this tin, record the amount, and deploy a replacement to the same location in one step. The collected tin returns to In Stock.
            </p>
          </CardHeader>
          <CardContent>
            <form action={swapTin} className="space-y-4">
              <input type="hidden" name="currentTinId" value={tin.id} />

              {/* Replacement: existing or new */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Replacement Tin
                  </label>
                  {inStockTins.length > 0 ? (
                    <select
                      name="replacementTinId"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">Select an in-stock tin...</option>
                      {inStockTins.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.tinNumber}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-sm text-amber-700 py-2">No tins in stock — enter a new tin number below</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Or New Tin Number
                  </label>
                  <Input
                    name="newTinNumber"
                    placeholder="e.g. TIN-042"
                  />
                  <p className="text-xs text-gray-400 mt-1">Creates a new tin and deploys it here</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Amount Collected (£)
                  </label>
                  <Input
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g. 25.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <Input
                    name="notes"
                    placeholder="e.g. Tin was nearly full"
                  />
                </div>
              </div>
              <Button type="submit" className="bg-amber-600 hover:bg-amber-700">
                <ArrowLeftRight className="h-4 w-4 mr-2" />
                Swap Out
              </Button>
            </form>
          </CardContent>
        </Card>
        </div>
      )}

      {/* Tin Details & Location */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900">
              Tin Details
            </h3>
          </CardHeader>
          <CardContent>
            <form action={editTin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tin Number
                </label>
                <Input
                  name="tinNumber"
                  defaultValue={tin.tinNumber}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <Textarea
                  name="notes"
                  defaultValue={tin.notes || ""}
                />
              </div>
              <div className="flex gap-4 text-sm text-gray-500">
                <span>Created by {tin.createdBy.name}</span>
                <span>{formatDate(tin.createdAt)}</span>
              </div>
              <Button type="submit" size="sm">
                Save Changes
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Location */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-indigo-600" />
              <h3 className="text-lg font-semibold text-gray-900">
                Location
              </h3>
            </div>
          </CardHeader>
          <CardContent>
            {tin.location && (
              <div className="mb-4 p-3 bg-indigo-50 rounded-lg">
                <Link
                  href={`/finance/collection-tins/locations/${tin.location.id}`}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  {tin.location.name}
                </Link>
                {tin.location.address && (
                  <p className="text-xs text-gray-500 mt-1">
                    {tin.location.address}
                  </p>
                )}
                {tin.location.type && tin.location.type !== "OTHER" && (
                  <Badge className="mt-2 bg-gray-100 text-gray-700 text-xs">
                    {tin.location.type}
                  </Badge>
                )}
              </div>
            )}
            {tin.location?.latitude && tin.location?.longitude && (
              <div className="mb-4">
                <SingleLocationMap
                  name={tin.location.name}
                  address={tin.location.address}
                  latitude={tin.location.latitude}
                  longitude={tin.location.longitude}
                  height="200px"
                />
              </div>
            )}

            <form action={assignLocation} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {tin.location ? "Change to Existing Location" : "Select Existing Location"}
                </label>
                <SearchableSelect
                  name="locationId"
                  placeholder="Search locations..."
                  defaultValue={tin.locationId || ""}
                  options={allLocations.map((loc) => ({
                    value: loc.id,
                    label: `${loc.name}${loc.type !== "OTHER" ? ` (${loc.type})` : ""}`,
                  }))}
                />
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-2 text-gray-500">or create new</span>
                </div>
              </div>

              <div className="space-y-3">
                <Input
                  label="New Location Name"
                  name="newLocationName"
                  placeholder="e.g., The Red Lion Pub"
                />
                <Input
                  label="Address"
                  name="newLocationAddress"
                  placeholder="Street address"
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="City"
                    name="newLocationCity"
                    placeholder="e.g. Oswestry"
                  />
                  <div>
                    <Input
                      label="Postcode"
                      name="newLocationPostcode"
                      placeholder="e.g. SY11 1NZ"
                    />
                    <p className="text-xs text-gray-400 mt-0.5">Area auto-assigned</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Type
                  </label>
                  <select
                    name="newLocationType"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="OTHER">Other</option>
                    <option value="SHOP">Shop</option>
                    <option value="PUB">Pub</option>
                    <option value="RESTAURANT">Restaurant</option>
                    <option value="OFFICE">Office</option>
                    <option value="SCHOOL">School</option>
                    <option value="CHURCH">Church</option>
                  </select>
                </div>
              </div>

              <Button type="submit" size="sm">
                {tin.location ? "Update Location" : "Set Location"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Movement History */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">
            Activity History
          </h3>
        </CardHeader>
        <CardContent>
          {tin.movements.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No activity recorded yet
            </p>
          ) : (
            <div className="space-y-3">
              {tin.movements.map((movement) => (
                <div
                  key={movement.id}
                  className="flex items-start gap-4 p-3 bg-gray-50 rounded-lg"
                >
                  <Badge className={movementColors[movement.type] || ""}>
                    {movement.type}
                  </Badge>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">
                      {formatDate(movement.date)}
                    </p>
                    {movement.notes && (
                      <p className="text-sm text-gray-600 mt-1">
                        {movement.notes}
                      </p>
                    )}
                  </div>
                  {movement.amount != null && (
                    <p className="text-sm font-bold text-green-600">
                      £{Number(movement.amount).toFixed(2)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete */}
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-900">Danger Zone</p>
              <p className="text-sm text-red-700">
                Permanently delete this tin and all its records.
              </p>
            </div>
            <form action={deleteTin}>
              <ConfirmButton
                message="Are you sure you want to delete this tin and all its collection records? This cannot be undone."
                variant="destructive"
                size="sm"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Tin
              </ConfirmButton>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
