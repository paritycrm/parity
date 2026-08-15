import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { ArrowLeft, Trash2, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { SingleLocationMap } from "@/components/ui/single-location-map";
import { geocodeAddress } from "@/lib/geocode";
import { derivePostcodeArea } from "@/lib/postcode";

export default async function TinLocationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const location = await prisma.tinLocation.findUnique({
    where: { id },
    include: {
      tins: {
        include: {
          movements: {
            where: { type: "COUNTED", amount: { not: null } },
            orderBy: { date: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!location) notFound();

  const totalCollected = location.tins.reduce(
    (sum, tin) =>
      sum + tin.movements.reduce((s, m) => s + Number(m.amount || 0), 0),
    0
  );
  const allCollections = location.tins
    .flatMap((tin) => tin.movements)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const collectionCount = allCollections.length;
  const avgPerCollection =
    collectionCount > 0 ? totalCollected / collectionCount : 0;

  async function editLocation(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const address = (formData.get("address") as string)?.trim() || null;
    const city = (formData.get("city") as string)?.trim() || null;
    const postcode = (formData.get("postcode") as string)?.trim().toUpperCase() || null;
    const postcodeArea = derivePostcodeArea(postcode);

    // Build full address for geocoding
    const fullAddress = [address, city, postcode].filter(Boolean).join(", ");
    let geoData: { latitude?: number | null; longitude?: number | null } = {};
    if (fullAddress) {
      const coords = await geocodeAddress(fullAddress);
      if (coords) {
        geoData = { latitude: coords.lat, longitude: coords.lng };
      }
    } else {
      geoData = { latitude: null, longitude: null };
    }

    await prisma.tinLocation.update({
      where: { id },
      data: {
        name: formData.get("name") as string,
        address,
        city,
        postcode,
        postcodeArea,
        type: (formData.get("type") as string) || "OTHER",
        contactName: (formData.get("contactName") as string) || null,
        contactPhone: (formData.get("contactPhone") as string) || null,
        notes: (formData.get("notes") as string) || null,
        ...geoData,
      },
    });

    revalidatePath(`/finance/collection-tins/locations/${id}`);
  }

  async function toggleActive(formData: FormData) {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    const current = await prisma.tinLocation.findUnique({ where: { id } });
    await prisma.tinLocation.update({
      where: { id },
      data: { isActive: !current?.isActive },
    });

    revalidatePath(`/finance/collection-tins/locations/${id}`);
  }

  async function deleteLocation() {
    "use server";
    const session = await getSession();
    if (!session) redirect("/login");

    // Unlink any tins first
    await prisma.collectionTin.updateMany({
      where: { locationId: id },
      data: { locationId: null },
    });

    await prisma.tinLocation.delete({ where: { id } });
    redirect("/finance/collection-tins/locations");
  }

  const typeColors: Record<string, string> = {
    SHOP: "bg-blue-100 text-blue-800",
    PUB: "bg-amber-100 text-amber-800",
    RESTAURANT: "bg-orange-100 text-orange-800",
    OFFICE: "bg-gray-100 text-gray-800",
    SCHOOL: "bg-green-100 text-green-800",
    CHURCH: "bg-purple-100 text-purple-800",
    OTHER: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/finance/collection-tins/locations"
          className="text-gray-400 hover:text-gray-600"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{location.name}</h1>
        <Badge className={typeColors[location.type] || ""}>{location.type}</Badge>
        {!location.isActive && (
          <Badge className="bg-red-100 text-red-800">Inactive</Badge>
        )}
      </div>

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
            <p className="text-sm text-gray-500 mt-1">Collections Made</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold text-amber-600">
              £{avgPerCollection.toFixed(2)}
            </p>
            <p className="text-sm text-gray-500 mt-1">Avg per Collection</p>
          </CardContent>
        </Card>
      </div>

      {/* Map */}
      {location.latitude && location.longitude && (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-indigo-600" />
              Map
            </h3>
          </CardHeader>
          <CardContent>
            <SingleLocationMap
              name={location.name}
              address={location.address}
              latitude={location.latitude}
              longitude={location.longitude}
            />
          </CardContent>
        </Card>
      )}

      {/* Edit Details */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">
            Location Details
          </h3>
        </CardHeader>
        <CardContent>
          <form action={editLocation} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name
                </label>
                <Input
                  name="name"
                  required
                  defaultValue={location.name}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type
                </label>
                <select
                  name="type"
                  defaultValue={location.type}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="SHOP">Shop</option>
                  <option value="PUB">Pub</option>
                  <option value="RESTAURANT">Restaurant</option>
                  <option value="OFFICE">Office</option>
                  <option value="SCHOOL">School</option>
                  <option value="CHURCH">Church</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Address
              </label>
              <Input
                name="address"
                defaultValue={location.address || ""}
                placeholder="Street address"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  City
                </label>
                <Input
                  name="city"
                  defaultValue={location.city || ""}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Postcode
                </label>
                <Input
                  name="postcode"
                  defaultValue={location.postcode || ""}
                  placeholder="e.g. SY11 1NZ"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Area group ({location.postcodeArea || "none"}) is set automatically
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Name
                </label>
                <Input
                  name="contactName"
                  defaultValue={location.contactName || ""}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Phone
                </label>
                <Input
                  name="contactPhone"
                  defaultValue={location.contactPhone || ""}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <Textarea
                name="notes"
                defaultValue={location.notes || ""}
              />
            </div>
            <Button type="submit" size="sm">Save Changes</Button>
          </form>
        </CardContent>
      </Card>

      {/* Tins at this location */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">
            Tins at this Location ({location.tins.length})
          </h3>
        </CardHeader>
        <CardContent>
          {location.tins.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No tins assigned to this location yet
            </p>
          ) : (
            <div className="space-y-3">
              {location.tins.map((tin) => {
                const tinTotal = tin.movements.reduce(
                  (s, m) => s + Number(m.amount || 0),
                  0
                );
                return (
                  <div
                    key={tin.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <Link
                        href={`/finance/collection-tins/${tin.id}`}
                        className="text-sm font-medium text-blue-600 hover:underline"
                      >
                        {tin.tinNumber}
                      </Link>
                      <p className="text-xs text-gray-500">
                        {tin.movements.length} collections
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-900">
                        £{tinTotal.toFixed(2)}
                      </p>
                      <Badge
                        className={
                          tin.status === "DEPLOYED"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }
                      >
                        {tin.status}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Collection History */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">
            Collection History
          </h3>
        </CardHeader>
        <CardContent>
          {allCollections.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No collections recorded yet
            </p>
          ) : (
            <div className="space-y-2">
              {allCollections.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between py-2 border-b border-gray-50"
                >
                  <div>
                    <p className="text-sm text-gray-900">
                      {formatDate(c.date)}
                    </p>
                    {c.notes && (
                      <p className="text-xs text-gray-500">{c.notes}</p>
                    )}
                  </div>
                  <p className="text-sm font-bold text-green-600">
                    £{Number(c.amount || 0).toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between">
        <form action={toggleActive}>
          <Button type="submit" variant="outline">
            {location.isActive ? "Mark Inactive" : "Mark Active"}
          </Button>
        </form>
        <form action={deleteLocation}>
          <ConfirmButton
            message="Are you sure you want to delete this location? Tins will be unlinked but not deleted."
            variant="destructive"
            size="sm"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Location
          </ConfirmButton>
        </form>
      </div>
    </div>
  );
}
