import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { becomeShipperAction } from "./actions";

/** Panel yük sahipleri için: rolü olmayan kullanıcıya rol ekleme kartı (FR-02). */
export function BecomeShipper() {
  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Yük sahibi olarak devam edin</CardTitle>
        <CardDescription>
          Bu panel yük sahipleri içindir. Hesabınıza yük sahibi rolü eklenir; nakliyeci olarak Android uygulamasını kullanmaya
          devam edebilirsiniz.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={becomeShipperAction}>
          <Button type="submit" className="h-11">
            Yük sahibi olarak devam et
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
